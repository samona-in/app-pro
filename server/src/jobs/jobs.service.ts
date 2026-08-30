import type { Prisma } from '../generated/prisma/client';
import {
  ServiceRequestStatus,
  JobOfferStatus,
  ProInterestStatus,
  canTransitionServiceRequest,
  isSelectableStatus,
  ACTIVE_JOB_STATUSES,
  type ServiceRequestDto,
  type JobOfferDto,
  type AvailableJobDto,
  type RespondingProDto,
  type ResponderType,
  type ProSummaryDto,
  type ExperienceLevel,
} from '@samona/types';
import { ORDER_LIFECYCLE } from '@samona/config';
import type { PrismaClient } from '../database/prisma';
import type { MatchingService } from '../matching/matching.service';
import { REALTIME_EVENTS, type RealtimeService } from '../realtime/gateway';
import { badRequest, notFound, conflict, forbidden } from '../common/errors';
import { distanceKm, etaMinutes } from '../common/geo';

export interface JobsServiceDeps {
  prisma: PrismaClient;
  matching: MatchingService;
  realtime: RealtimeService;
}

const minutes = (n: number): Date => new Date(Date.now() + n * 60_000);
const seconds = (n: number): Date => new Date(Date.now() + n * 1_000);
const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

const pointOf = (pro: {
  latitude: number | null;
  longitude: number | null;
}): { latitude: number; longitude: number } | null =>
  pro.latitude !== null && pro.longitude !== null
    ? { latitude: pro.latitude, longitude: pro.longitude }
    : null;

const TEMPORARY_STATUSES: ServiceRequestStatus[] = [
  ServiceRequestStatus.REQUESTED,
  ServiceRequestStatus.DISPATCHING,
  ServiceRequestStatus.OPEN,
  ServiceRequestStatus.CHOOSING_PRO,
];

/**
 * Every read of a request across the API shares one projection so a change
 * cannot appear on one screen but not another.
 */
const requestSummarySelect = {
  id: true,
  customerId: true,
  serviceId: true,
  status: true,
  description: true,
  photos: true,
  latitude: true,
  longitude: true,
  address: true,
  selectedProId: true,
  estimatedPrice: true,
  finalPrice: true,
  requestedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { id: true, slug: true, name: true, icon: true } },
  customer: { select: { displayName: true, locationLabel: true } },
  selectedPro: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      rating: true,
      completedJobs: true,
      experienceLevel: true,
    },
  },
  offers: {
    where: { status: { in: [JobOfferStatus.ACCEPTED, JobOfferStatus.SELECTED] } },
    select: {
      id: true,
      status: true,
      distanceKm: true,
      estimatedEtaMinutes: true,
      pro: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          rating: true,
          completedJobs: true,
          experienceLevel: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
  interests: {
    where: { status: { in: [ProInterestStatus.INTERESTED, ProInterestStatus.SELECTED] } },
    select: {
      id: true,
      status: true,
      pro: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          rating: true,
          completedJobs: true,
          experienceLevel: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceRequestSelect;

type RequestSummary = Prisma.ServiceRequestGetPayload<{
  select: typeof requestSummarySelect;
}>;

type ProProfileRef = {
  id: string;
  userId: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Jobs domain service — owns the whole order-service lifecycle.
 *
 * A customer files a service_request; the service dispatches it as instant
 * offers, or opens it to pro interest. The customer selects a pro atomically
 * and the same row becomes the confirmed job, driven on site by the pro. Every
 * state change is validated against the transition map and logged to
 * JobStatusHistory. REST is the source of truth; realtime only delivers the
 * notifications (CLAUDE.md "Realtime").
 */
export function createJobsService(deps: JobsServiceDeps) {
  const findProByUserId = async (userId: string): Promise<ProProfileRef> => {
    const pro = await deps.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!pro) throw forbidden('No professional profile for this account.');
    return { ...pro, userId };
  };

  const isConfirmedRequest = (status: ServiceRequestStatus): boolean =>
    (ACTIVE_JOB_STATUSES as readonly ServiceRequestStatus[]).includes(status);

  const toProSummary = (pro: {
    id: string;
    userId: string;
    displayName: string | null;
    rating: number | null;
    completedJobs: number;
    experienceLevel: unknown;
  }): ProSummaryDto => ({
    proId: pro.id,
    userId: pro.userId,
    displayName: pro.displayName,
    rating: pro.rating,
    completedJobs: pro.completedJobs,
    experienceLevel: pro.experienceLevel as ExperienceLevel | null,
    distanceKm: null,
    estimatedEtaMinutes: null,
  });

  /**
   * The shortlist the customer chooses from: accepted offers plus interested
   * pros, ordered by distance.
   */
  const respondingPros = (row: RequestSummary): RespondingProDto[] => {
    const requestPoint =
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null;

    const fromOffer = (offer: RequestSummary['offers'][number]): RespondingProDto => ({
      ...toProSummary(offer.pro),
      respondType: 'offer',
      responderId: offer.id,
      responderStatus: offer.status,
      distanceKm: offer.distanceKm,
      estimatedEtaMinutes: offer.estimatedEtaMinutes,
    });

    const fromInterest = (interest: RequestSummary['interests'][number]): RespondingProDto => {
      const proPoint = pointOf(interest.pro);
      const km = requestPoint && proPoint ? distanceKm(requestPoint, proPoint) : null;
      return {
        ...toProSummary(interest.pro),
        respondType: 'interest',
        responderId: interest.id,
        responderStatus: interest.status,
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
      };
    };

    return [...row.offers.map(fromOffer), ...row.interests.map(fromInterest)].sort(
      (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    );
  };

  const toServiceRequestDto = (
    row: RequestSummary,
    forViewer: 'customer' | 'pro',
  ): ServiceRequestDto => ({
    id: row.id,
    status: row.status,
    description: row.description,
    photos: row.photos,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    selectedProId: row.selectedProId,
    estimatedPrice: row.estimatedPrice,
    finalPrice: row.finalPrice,
    requestedAt: iso(row.requestedAt),
    expiresAt: isoOrNull(row.expiresAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    service: row.service,
    // A pro only learns who the customer is once the job is confirmed.
    customer:
      forViewer === 'pro' && isConfirmedRequest(row.status)
        ? {
            userId: row.customerId,
            displayName: row.customer.displayName,
            locationLabel: row.customer.locationLabel,
          }
        : null,
    respondingPros: forViewer === 'customer' ? respondingPros(row) : [],
  });

  const fetchRequestSummary = async (
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<RequestSummary> => tx.serviceRequest.findFirstOrThrow({ where: { id }, select: requestSummarySelect });

  /**
   * Writes one request state change after validating it against the transition
   * map. The only place `status` is ever changed.
   */
  const transitionRequest = async (
    tx: Prisma.TransactionClient,
    id: string,
    current: ServiceRequestStatus,
    target: ServiceRequestStatus,
    changedById: string,
    note?: string,
    expiresAt?: Date | null,
  ): Promise<void> => {
    if (!canTransitionServiceRequest(current, target)) {
      throw conflict(`A request cannot move from ${current} to ${target}.`);
    }
    await tx.jobStatusHistory.create({
      data: { serviceRequestId: id, status: target, changedById, note },
    });
    await tx.serviceRequest.update({
      where: { id },
      data: { status: target, ...(expiresAt !== undefined ? { expiresAt } : {}) },
    });
  };

  /** Moves a dispatching request to OPEN (no one will take it by offer). */
  const openRequest = async (
    tx: Prisma.TransactionClient,
    row: RequestSummary,
    changedById: string,
    note: string,
  ): Promise<void> => {
    await transitionRequest(
      tx,
      row.id,
      row.status,
      ServiceRequestStatus.OPEN,
      changedById,
      note,
      minutes(ORDER_LIFECYCLE.openJobMinutes),
    );
  };

  const toJobOfferDto = (
    request: RequestSummary,
    offerId: string,
    pro: { proId: string; distanceKm: number; etaMinutes: number },
  ): JobOfferDto => ({
    id: offerId,
    status: JobOfferStatus.OFFERED,
    distanceKm: pro.distanceKm,
    estimatedEtaMinutes: pro.etaMinutes,
    offeredAt: new Date().toISOString(),
    respondedAt: null,
    expiresAt: null,
    service: request.service,
    request: {
      id: request.id,
      description: request.description,
      address: request.address,
      latitude: request.latitude,
      longitude: request.longitude,
      estimatedPrice: request.estimatedPrice,
    },
  });

  /**
   * Issues the next dispatch round, or opens the request when no candidates
   * remain. Called after any offer terminalises while the request is still in
   * a temporary state. Distances are snapshotted at offer time.
   */
  const advanceDispatch = async (
    tx: Prisma.TransactionClient,
    row: RequestSummary,
    changedById: string,
  ): Promise<{ emittedTo: { userId: string; payload: JobOfferDto }[] }> => {
    if (row.status !== ServiceRequestStatus.DISPATCHING) return { emittedTo: [] };

    const offers = await tx.jobOffer.findMany({
      where: { serviceRequestId: row.id },
      select: { proId: true, status: true },
    });

    if (offers.some((o) => o.status === JobOfferStatus.ACCEPTED)) return { emittedTo: [] };
    if (offers.some((o) => o.status === JobOfferStatus.OFFERED)) return { emittedTo: [] };

    if (row.latitude === null || row.longitude === null) {
      await openRequest(tx, row, changedById, 'No location to match against.');
      return { emittedTo: [] };
    }

    const dispatchedProIds = offers.map((o) => o.proId);
    const roundsUsed = Math.ceil(offers.length / ORDER_LIFECYCLE.dispatchBatchSize);

    if (roundsUsed >= ORDER_LIFECYCLE.maxDispatchRounds) {
      await openRequest(tx, row, changedById, 'No professional answered the dispatch.');
      return { emittedTo: [] };
    }

    const candidates = await deps.matching.findEligiblePros({
      serviceId: row.serviceId,
      latitude: row.latitude,
      longitude: row.longitude,
      skipProIds: dispatchedProIds,
      limit: ORDER_LIFECYCLE.dispatchBatchSize,
    });

    if (candidates.length === 0) {
      await openRequest(tx, row, changedById, 'No more eligible professionals in range.');
      return { emittedTo: [] };
    }

    const offeredAt = new Date();
    const offerExpiry = seconds(ORDER_LIFECYCLE.offerSeconds);
    const emittedTo: { userId: string; payload: JobOfferDto }[] = [];

    for (const pro of candidates) {
      const offer = await tx.jobOffer.create({
        data: {
          serviceRequestId: row.id,
          proId: pro.proId,
          distanceKm: pro.distanceKm,
          estimatedEtaMinutes: pro.etaMinutes,
          offeredAt,
          expiresAt: offerExpiry,
        },
      });
      emittedTo.push({ userId: pro.userId, payload: toJobOfferDto(row, offer.id, pro) });
    }

    // Still the same DISPATCHING phase; just re-arm the window for this round.
    await tx.serviceRequest.update({
      where: { id: row.id },
      data: { expiresAt: seconds(ORDER_LIFECYCLE.offerSeconds * ORDER_LIFECYCLE.maxDispatchRounds) },
    });

    return { emittedTo };
  };

  // ---------------------------------------------------------------------------
  // Customer side
  // ---------------------------------------------------------------------------

  async function createServiceRequest(customerUserId: string, input: CreateServiceRequestInput) {
    const customer = await deps.prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true },
    });
    if (!customer) throw forbidden('Complete customer onboarding before requesting work.');

    const service = await deps.prisma.service.findFirst({
      where: { id: input.serviceId, isActive: true },
      select: { id: true },
    });
    if (!service) throw badRequest('Choose a service we actually offer.');

    const emittedTo: { userId: string; payload: JobOfferDto }[] = [];

    const created = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.create({
        data: {
          customerId: customerUserId,
          serviceId: input.serviceId,
          status: ServiceRequestStatus.REQUESTED,
          description: input.description ?? null,
          photos: input.photos ?? [],
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          address: input.address ?? null,
          estimatedPrice: input.estimatedPrice ?? null,
          // Safety net: a crash between create and the dispatch step must not
          // leave a permanent REQUESTED row behind.
          expiresAt: minutes(ORDER_LIFECYCLE.openJobMinutes),
        },
        select: requestSummarySelect,
      });

      await tx.jobStatusHistory.create({
        data: {
          serviceRequestId: row.id,
          status: ServiceRequestStatus.REQUESTED,
          changedById: customerUserId,
          note: 'Request filed.',
        },
      });

      if (row.latitude === null || row.longitude === null) {
        await openRequest(tx, row, customerUserId, 'No location to match against.');
      } else {
        const candidates = await deps.matching.findEligiblePros({
          serviceId: input.serviceId,
          latitude: row.latitude,
          longitude: row.longitude,
          limit: ORDER_LIFECYCLE.dispatchBatchSize,
        });

        if (candidates.length === 0) {
          await openRequest(tx, row, customerUserId, 'No professional in range right now.');
        } else {
          const offeredAt = new Date();
          const offerExpiry = seconds(ORDER_LIFECYCLE.offerSeconds);

          for (const pro of candidates) {
            const offer = await tx.jobOffer.create({
              data: {
                serviceRequestId: row.id,
                proId: pro.proId,
                distanceKm: pro.distanceKm,
                estimatedEtaMinutes: pro.etaMinutes,
                offeredAt,
                expiresAt: offerExpiry,
              },
            });
            emittedTo.push({ userId: pro.userId, payload: toJobOfferDto(row, offer.id, pro) });
          }

          await transitionRequest(
            tx,
            row.id,
            ServiceRequestStatus.REQUESTED,
            ServiceRequestStatus.DISPATCHING,
            customerUserId,
            `Dispatched to ${candidates.length} professional${candidates.length === 1 ? '' : 's'}.`,
            seconds(ORDER_LIFECYCLE.offerSeconds * ORDER_LIFECYCLE.maxDispatchRounds),
          );
        }
      }

      return fetchRequestSummary(tx, row.id);
    });

    const dto = toServiceRequestDto(created, 'customer');
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
    for (const perPro of emittedTo) {
      deps.realtime.emitToUser(perPro.userId, REALTIME_EVENTS.JOB_OFFER, perPro.payload);
    }
    return dto;
  }

  async function listForCustomer(
    customerUserId: string,
    options: { status?: ServiceRequestStatus; limit?: number; offset?: number } = {},
  ): Promise<ServiceRequestDto[]> {
    const rows = await deps.prisma.serviceRequest.findMany({
      where: { customerId: customerUserId, ...(options.status ? { status: options.status } : {}) },
      select: requestSummarySelect,
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return rows.map((row) => toServiceRequestDto(row, 'customer'));
  }

  async function getForCustomer(customerUserId: string, id: string): Promise<ServiceRequestDto> {
    const row = await deps.prisma.serviceRequest.findFirst({
      where: { id, customerId: customerUserId },
      select: requestSummarySelect,
    });
    if (!row) throw notFound('This request is not yours.');
    return toServiceRequestDto(row, 'customer');
  }

  async function cancelServiceRequest(
    customerUserId: string,
    id: string,
    note?: string,
  ): Promise<ServiceRequestDto> {
    const cancellable: ServiceRequestStatus[] = [
      ServiceRequestStatus.REQUESTED,
      ServiceRequestStatus.DISPATCHING,
      ServiceRequestStatus.OPEN,
      ServiceRequestStatus.CHOOSING_PRO,
      ServiceRequestStatus.CONFIRMED,
      ServiceRequestStatus.TRAVELLING,
    ];

    const updated = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.findFirst({
        where: { id, customerId: customerUserId },
        select: requestSummarySelect,
      });
      if (!row) throw notFound('This request is not yours.');

      if (!cancellable.includes(row.status)) {
        throw conflict('This request can no longer be cancelled.');
      }

      await transitionRequest(
        tx,
        id,
        row.status,
        ServiceRequestStatus.CANCELLED,
        customerUserId,
        note ?? 'Cancelled by the customer.',
        null,
      );
      await tx.jobOffer.updateMany({
        where: { serviceRequestId: id, status: { in: [JobOfferStatus.OFFERED, JobOfferStatus.ACCEPTED] } },
        data: { status: JobOfferStatus.CANCELLED },
      });
      await tx.proInterest.updateMany({
        where: { serviceRequestId: id, status: ProInterestStatus.INTERESTED },
        data: { status: ProInterestStatus.CANCELLED },
      });
      return fetchRequestSummary(tx, id);
    });

    const dto = toServiceRequestDto(updated, 'customer');
    // Everyone who was eyeing the request should stop.
    const proUserIds = updated.offers
      .map((o) => o.pro.userId)
      .concat(updated.interests.map((i) => i.pro.userId));
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
    deps.realtime.emitToUsers(proUserIds, REALTIME_EVENTS.REQUEST_STATUS, dto);
    return dto;
  }

  async function selectPro(
    customerUserId: string,
    id: string,
    input: { respondType: ResponderType; responderId: string },
  ): Promise<ServiceRequestDto> {
    let selectedProUserId: string | null = null;

    const updated = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.findFirst({
        where: { id, customerId: customerUserId },
        select: requestSummarySelect,
      });
      if (!row) throw notFound('This request is not yours.');

      if (!isSelectableStatus(row.status)) {
        throw conflict('This request can no longer accept a professional.');
      }
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
        throw conflict('This request has expired.');
      }

      const offer =
        input.respondType === 'offer'
          ? row.offers.find((o) => o.id === input.responderId && o.status === JobOfferStatus.ACCEPTED)
          : undefined;
      const interest =
        input.respondType === 'interest'
          ? row.interests.find((i) => i.id === input.responderId && i.status === ProInterestStatus.INTERESTED)
          : undefined;

      if (input.respondType === 'offer' && !offer) {
        throw badRequest('This professional has not accepted the job.');
      }
      if (input.respondType === 'interest' && !interest) {
        throw badRequest('This professional is no longer interested.');
      }

      const proId = input.respondType === 'offer' ? offer!.pro.id : interest!.pro.id;

      // The `selectedProId: null` guard makes a double selection impossible:
      // a racing second transaction touches zero rows.
      const claimed = await tx.serviceRequest.updateMany({
        where: {
          id,
          status: { in: [ServiceRequestStatus.OPEN, ServiceRequestStatus.CHOOSING_PRO] },
          selectedProId: null,
        },
        data: { status: ServiceRequestStatus.CONFIRMED, selectedProId: proId, expiresAt: null },
      });
      if (claimed.count !== 1) throw conflict('This request was already assigned.');

      if (input.respondType === 'offer') {
        await tx.jobOffer.update({
          where: { id: input.responderId },
          data: { status: JobOfferStatus.SELECTED, respondedAt: new Date() },
        });
      } else {
        await tx.proInterest.update({
          where: { id: input.responderId },
          data: { status: ProInterestStatus.SELECTED },
        });
      }

      // Everyone else is released from the request in the same transaction.
      await tx.jobOffer.updateMany({
        where: { serviceRequestId: id, status: { in: [JobOfferStatus.OFFERED, JobOfferStatus.ACCEPTED] } },
        data: { status: JobOfferStatus.CANCELLED },
      });
      await tx.proInterest.updateMany({
        where: { serviceRequestId: id, status: ProInterestStatus.INTERESTED },
        data: { status: ProInterestStatus.REJECTED },
      });

      await tx.jobStatusHistory.create({
        data: { serviceRequestId: id, status: ServiceRequestStatus.CONFIRMED, changedById: customerUserId },
      });

      selectedProUserId =
        input.respondType === 'offer' ? offer!.pro.userId : interest!.pro.userId;
      return fetchRequestSummary(tx, id);
    });

    const dto = toServiceRequestDto(updated, 'customer');
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
    if (selectedProUserId) deps.realtime.emitToUser(selectedProUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
    return dto;
  }

  // ---------------------------------------------------------------------------
  // Pro side
  // ---------------------------------------------------------------------------

  async function listProOffers(
    proUserId: string,
    options: { status?: JobOfferStatus; limit?: number } = {},
  ) {
    const pro = await findProByUserId(proUserId);

    const rows = await deps.prisma.jobOffer.findMany({
      where: { proId: pro.id, ...(options.status ? { status: options.status } : {}) },
      include: {
        serviceRequest: {
          select: {
            id: true,
            description: true,
            address: true,
            latitude: true,
            longitude: true,
            estimatedPrice: true,
            service: { select: { id: true, slug: true, name: true, icon: true } },
          },
        },
      },
      orderBy: { offeredAt: 'desc' },
      take: options.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      distanceKm: row.distanceKm,
      estimatedEtaMinutes: row.estimatedEtaMinutes,
      offeredAt: iso(row.offeredAt),
      respondedAt: isoOrNull(row.respondedAt),
      expiresAt: isoOrNull(row.expiresAt),
      service: row.serviceRequest.service,
      request: {
        id: row.serviceRequest.id,
        description: row.serviceRequest.description,
        address: row.serviceRequest.address,
        latitude: row.serviceRequest.latitude,
        longitude: row.serviceRequest.longitude,
        estimatedPrice: row.serviceRequest.estimatedPrice,
      },
    }));
  }

  /**
   * A pro accepts or declines one of their dispatch offers, atomically. The
   * first acceptance moves the request to the customer's choosing screen and
   * starts the selection clock; a decline lets the next dispatch round fly.
   */
  async function respondToOffer(
    proUserId: string,
    offerId: string,
    action: 'accept' | 'decline',
  ): Promise<{ offerStatus: JobOfferStatus; requestId: string }> {
    const pro = await findProByUserId(proUserId);
    let requestId = '';
    let accepted = false;
    let ownerUserId = '';

    await deps.prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.findFirst({
        where: { id: offerId, proId: pro.id },
        include: { serviceRequest: { select: requestSummarySelect } },
      });
      if (!offer) throw notFound('This offer is not yours or no longer exists.');

      if (offer.status !== JobOfferStatus.OFFERED) {
        throw conflict('This offer has already been answered.');
      }

      const request = offer.serviceRequest;
      const requestAccepting =
        request.status === ServiceRequestStatus.DISPATCHING ||
        request.status === ServiceRequestStatus.CHOOSING_PRO;

      // Lazy expiry of the offer; the sweeper does the bulk of the work.
      if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) {
        await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.EXPIRED } });
        await advanceDispatch(tx, request, proUserId);
        throw conflict('This offer has expired.');
      }
      if (!requestAccepting) {
        throw conflict('This request is no longer accepting responses.');
      }
      if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
        throw conflict('This request has expired.');
      }

      requestId = request.id;
      ownerUserId = request.customerId;

      if (action === 'decline') {
        await tx.jobOffer.update({
          where: { id: offerId },
          data: { status: JobOfferStatus.DECLINED, respondedAt: new Date() },
        });
        await advanceDispatch(tx, request, proUserId);
        return;
      }

      // Accept. One reserved job at a time.
      const activeJobs = await tx.serviceRequest.count({
        where: { selectedProId: pro.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      });
      if (activeJobs > 0) {
        await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.CANCELLED } });
        throw conflict('You already have a job in progress.');
      }

      await tx.jobOffer.update({
        where: { id: offerId },
        data: { status: JobOfferStatus.ACCEPTED, respondedAt: new Date() },
      });

      accepted = true;

      if (request.status === ServiceRequestStatus.DISPATCHING) {
        await transitionRequest(
          tx,
          request.id,
          request.status,
          ServiceRequestStatus.CHOOSING_PRO,
          proUserId,
          'A professional accepted the dispatch.',
          minutes(ORDER_LIFECYCLE.selectionMinutes),
        );
      }
    });

    if (accepted) {
      const dto = toServiceRequestDto(await getRequestSummary(requestId), 'customer');
      // The request may not be confirmed yet, so `dto.customer` is deliberately
      // hidden; the owner's id lives on the request itself.
      if (ownerUserId) deps.realtime.emitToUser(ownerUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
      deps.realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_OFFER_STATUS, {
        id: offerId,
        offerStatus: 'ACCEPTED',
      });
    }

    return { offerStatus: accepted ? JobOfferStatus.ACCEPTED : JobOfferStatus.DECLINED, requestId };
  }

  async function listProJobs(
    proUserId: string,
    options: { status?: ServiceRequestStatus; limit?: number } = {},
  ): Promise<ServiceRequestDto[]> {
    const pro = await findProByUserId(proUserId);
    const rows = await deps.prisma.serviceRequest.findMany({
      where: { selectedProId: pro.id, ...(options.status ? { status: options.status } : {}) },
      select: requestSummarySelect,
      orderBy: { updatedAt: 'desc' },
      take: options.limit ?? 50,
    });
    return rows.map((row) => toServiceRequestDto(row, 'pro'));
  }

  async function listAvailableJobs(
    proUserId: string,
    options: { serviceId?: string; limit?: number; offset?: number } = {},
  ): Promise<AvailableJobDto[]> {
    const pro = await findProByUserId(proUserId);

    const busy = await deps.prisma.serviceRequest.count({
      where: { selectedProId: pro.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
    });
    if (busy > 0) return [];

    const myServices = await deps.prisma.proService.findMany({
      where: { proProfileId: pro.id },
      select: { serviceId: true },
    });
    const serviceIds = myServices.map((s) => s.serviceId);
    if (serviceIds.length === 0) return [];

    const rows = await deps.prisma.serviceRequest.findMany({
      where: {
        status: ServiceRequestStatus.OPEN,
        serviceId: { in: options.serviceId ? [options.serviceId] : serviceIds },
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        estimatedPrice: true,
        requestedAt: true,
        expiresAt: true,
        service: { select: { id: true, slug: true, name: true, icon: true } },
        interests: { where: { proId: pro.id, status: ProInterestStatus.INTERESTED }, select: { id: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: options.limit ?? 30,
      skip: options.offset ?? 0,
    });

    const myPoint =
      pro.latitude !== null && pro.longitude !== null
        ? { latitude: pro.latitude, longitude: pro.longitude }
        : null;

    return rows.map((row) => {
      const requestPoint =
        row.latitude !== null && row.longitude !== null
          ? { latitude: row.latitude, longitude: row.longitude }
          : null;
      const km = myPoint && requestPoint ? distanceKm(myPoint, requestPoint) : null;
      return {
        id: row.id,
        status: ServiceRequestStatus.OPEN,
        description: row.description,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
        estimatedPrice: row.estimatedPrice,
        requestedAt: iso(row.requestedAt),
        expiresAt: isoOrNull(row.expiresAt),
        service: row.service,
        isInterested: row.interests.length > 0,
      };
    });
  }

  async function createProInterest(
    proUserId: string,
    input: { serviceRequestId: string },
  ): Promise<ServiceRequestDto> {
    const pro = await findProByUserId(proUserId);
    let customerUserId = '';

    await deps.prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.findFirst({
        where: { id: input.serviceRequestId },
        select: requestSummarySelect,
      });
      if (!row) throw notFound('This request no longer exists.');

      if (row.status !== ServiceRequestStatus.OPEN) {
        throw conflict('This request is not open to interest.');
      }
      if (row.latitude === null || row.longitude === null) {
        throw conflict('This request has no location to match against.');
      }

      const busy = await tx.serviceRequest.count({
        where: { selectedProId: pro.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      });
      if (busy > 0) throw conflict('You already have a job in progress.');

      const eligible = await deps.matching.isProEligible(pro.id, {
        serviceId: row.serviceId,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (!eligible) throw conflict('This request is outside your service area.');

      const count = await tx.proInterest.count({
        where: { serviceRequestId: row.id, status: ProInterestStatus.INTERESTED },
      });
      if (count >= ORDER_LIFECYCLE.maxInterestedPros) {
        throw conflict('This request already has enough interested professionals.');
      }

      await tx.proInterest.create({
        data: { serviceRequestId: row.id, proId: pro.id, status: ProInterestStatus.INTERESTED },
      });

      customerUserId = row.customerId;
    });

    const summary = await getRequestSummary(input.serviceRequestId);
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.SHORTLIST_UPDATED, toServiceRequestDto(summary, 'customer'));
    return toServiceRequestDto(summary, 'pro');
  }

  async function getRequestSummary(id: string): Promise<RequestSummary> {
    const row = await deps.prisma.serviceRequest.findFirst({ where: { id }, select: requestSummarySelect });
    if (!row) throw notFound('Request not found.');
    return row;
  }

  /**
   * On-site stages driven by the assigned pro: en route → arrived → in
   * progress → done. Completing the job anchors the price server-side and
   * records the pending payment to collect.
   */
  async function transitionJob(
    proUserId: string,
    id: string,
    action: 'travel' | 'arrived' | 'start' | 'complete',
    note?: string,
  ): Promise<ServiceRequestDto> {
    const pro = await findProByUserId(proUserId);
    let customerUserId = '';

    const updated = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.serviceRequest.findFirst({
        where: { id, selectedProId: pro.id },
        select: requestSummarySelect,
      });
      if (!row) throw notFound('This job is not assigned to you.');

      const target =
        action === 'travel'
          ? ServiceRequestStatus.TRAVELLING
          : action === 'arrived'
            ? ServiceRequestStatus.ARRIVED
            : action === 'start'
              ? ServiceRequestStatus.IN_PROGRESS
              : ServiceRequestStatus.COMPLETED;

      await transitionRequest(tx, id, row.status, target, proUserId, note);

      if (action === 'complete') {
        // The server anchors the price; a client can never set what a job costs.
        const amount = row.estimatedPrice ?? 0;
        await tx.serviceRequest.update({ where: { id }, data: { finalPrice: amount } });
        await tx.payment.upsert({
          where: { serviceRequestId: id },
          create: { serviceRequestId: id, amount, status: 'PENDING' },
          update: {},
        });
      }

      customerUserId = row.customerId;
      return fetchRequestSummary(tx, id);
    });

    const dto = toServiceRequestDto(updated, 'customer');
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.REQUEST_STATUS, dto);
    if (action === 'complete') {
      deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.PAYMENT_STATUS, dto);
    }
    return dto;
  }

  // ---------------------------------------------------------------------------
  // Housekeeping
  // ---------------------------------------------------------------------------

  /**
   * Age out temporary requests and unreplied offers. Runs on an interval and
   * lazily on reads, so a stopped sweeper can never keep a live request alive
   * forever.
   */
  async function runExpirySweeper(): Promise<void> {
    const now = new Date();

    const staleOffers = await deps.prisma.jobOffer.findMany({
      where: { status: JobOfferStatus.OFFERED, expiresAt: { lt: now } },
      select: { serviceRequestId: true },
    });
    const staleRequests = await deps.prisma.serviceRequest.findMany({
      where: { status: { in: TEMPORARY_STATUSES }, expiresAt: { lt: now } },
      select: { id: true },
    });

    const ids = [
      ...new Set([...staleOffers.map((o) => o.serviceRequestId), ...staleRequests.map((r) => r.id)]),
    ];

    for (const id of ids) {
      await deps.prisma.$transaction(async (tx) => {
        const row = await tx.serviceRequest.findFirst({
          where: { id, status: { in: TEMPORARY_STATUSES } },
          select: requestSummarySelect,
        });
        if (!row) return;

        if (row.status === ServiceRequestStatus.DISPATCHING) {
          await tx.jobOffer.updateMany({
            where: { serviceRequestId: id, status: JobOfferStatus.OFFERED, expiresAt: { lt: new Date() } },
            data: { status: JobOfferStatus.EXPIRED },
          });
          if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
            await openRequest(tx, row, 'system', 'Dispatch timed out.');
          }
          return;
        }

        await tx.jobOffer.updateMany({
          where: { serviceRequestId: id, status: { in: [JobOfferStatus.OFFERED, JobOfferStatus.ACCEPTED] } },
          data: { status: JobOfferStatus.CANCELLED },
        });
        await tx.proInterest.updateMany({
          where: { serviceRequestId: id, status: ProInterestStatus.INTERESTED },
          data: { status: ProInterestStatus.EXPIRED },
        });
        await transitionRequest(
          tx,
          id,
          row.status,
          ServiceRequestStatus.EXPIRED,
          'system',
          'The request expired before a professional was chosen.',
          null,
        );
      });
    }
  }

  return {
    createServiceRequest,
    listForCustomer,
    getForCustomer,
    cancelServiceRequest,
    selectPro,
    listProOffers,
    respondToOffer,
    listProJobs,
    listAvailableJobs,
    createProInterest,
    transitionJob,
    getRequestSummary,
    runExpirySweeper,
  };
}

export type JobsService = ReturnType<typeof createJobsService>;

type CreateServiceRequestInput = {
  serviceId: string;
  description?: string;
  photos?: string[];
  latitude?: number;
  longitude?: number;
  address?: string;
  estimatedPrice?: number;
};