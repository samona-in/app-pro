import {
  JobStatus,
  ACTIVE_JOB_STATUSES,
  canTransition,
  type Job,
  type JobDetail,
  type AvailableJob,
} from '@samona/types';
import type { CreateJobInput, JobAction } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { RealtimeService } from '../realtime/gateway';
import { REALTIME_EVENTS } from '../realtime/gateway';
import type { MatchingService } from '../matching/matching.service';
import { badRequest, notFound, conflict, forbidden } from '../common/errors';
import { distanceKm, etaMinutes } from '../common/geo';

export interface JobsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  matching: MatchingService;
  realtime: RealtimeService;
}

/** The customer scoped folder every job image is minted under. */
function jobImageScope(customerUserId: string): string {
  return `jobs/${customerUserId}/`;
}

/** The projection every job read shares, so a change appears on every screen. */
const jobInclude = {
  service: { select: { id: true, slug: true, name: true, icon: true } },
  skill: { select: { id: true, slug: true, name: true } },
} as const;

/** The projection job *detail* reads use: counterparty identity + coordinates. */
const jobDetailInclude = {
  ...jobInclude,
  customer: {
    select: {
      userId: true,
      displayName: true,
      locationLabel: true,
      latitude: true,
      longitude: true,
    },
  },
  pro: { select: { id: true, userId: true, displayName: true, rating: true } },
} as const;

type JobRow = {
  id: string;
  customerId: string;
  proId: string | null;
  status: JobStatus;
  description: string;
  imagePaths: string[];
  basePayPaise: number;
  agreedPayPaise: number | null;
  finalPayPaise: number | null;
  createdAt: Date;
  updatedAt: Date;
  service: Job['service'];
  skill: Job['skill'];
  customSkill: string | null;
  placeType: Job['placeType'];
  placeDescription: string | null;
};

type JobDetailRow = JobRow & {
  customer: {
    userId: string;
    displayName: string | null;
    locationLabel: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  pro: { id: string; userId: string; displayName: string | null; rating: number | null } | null;
};

const iso = (d: Date): string => d.toISOString();

function toJobDto(row: JobRow, storage: StorageService): Job {
  return {
    id: row.id,
    customerId: row.customerId,
    proId: row.proId,
    service: row.service,
    skill: row.skill,
    customSkill: row.customSkill,
    status: row.status,
    placeType: row.placeType,
    placeDescription: row.placeDescription,
    description: row.description,
    imageUrls: row.imagePaths.map((path) => storage.jobImagePublicUrl(path)),
    basePayPaise: row.basePayPaise,
    agreedPayPaise: row.agreedPayPaise,
    finalPayPaise: row.finalPayPaise,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * A detail read shaped for one viewer.
 *
 * The customer's identity stays hidden from a pro until the job is accepted
 * (ACCEPTED onwards): the pro meets the customer only once committed. The
 * assigned pro is shown to the customer from acceptance on.
 */
function toJobDetail(
  row: JobDetailRow,
  forViewer: 'customer' | 'pro',
  storage: StorageService,
): JobDetail {
  const assigned = row.status !== JobStatus.REQUESTED && row.status !== JobStatus.OFFERED;
  return {
    ...toJobDto(row, storage),
    distanceKm: null,
    estimatedEtaMinutes: null,
    customer:
      forViewer === 'pro' && assigned && row.customer
        ? {
            userId: row.customer.userId,
            displayName: row.customer.displayName,
            locationLabel: row.customer.locationLabel,
          }
        : null,
    pro:
      forViewer === 'customer' && assigned && row.pro
        ? { proId: row.pro.id, displayName: row.pro.displayName, rating: row.pro.rating }
        : null,
  };
}

/**
 * Jobs domain service — the whole order lifecycle on the deployed `jobs` model.
 *
 * A customer files a job request (REQUESTED, unassigned); it stays that way
 * until an eligible pro accepts it atomically (ACCEPTED, its `proId` set), the
 * assigned pro drives the on-site stages, and the customer settles the payment.
 * Every transition is validated against the shared transition map and logged to
 * JobStatusHistory. REST is the source of truth; realtime only notifies.
 */
export function createJobsService(deps: JobsServiceDeps) {
  const { prisma, storage, matching, realtime } = deps;

  const findProByUserId = async (userId: string) => {
    const pro = await prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!pro) throw forbidden('No professional profile for this account.');
    return pro;
  };

  // -------------------------------------------------------------------------
  // Customer side
  // -------------------------------------------------------------------------

  /**
   * Places a job request (the customer booking flow's final step).
   *
   * The service and skill are resolved from slugs server-side; nothing
   * id-based from the client is trusted. Reference photos are verified to have
   * reached storage and to live under the caller's own scope.
   */
  async function createForCustomer(
    customerUserId: string,
    input: CreateJobInput,
  ): Promise<JobDetail> {
    const customer = await prisma.customerProfile.findUnique({
      where: { userId: customerUserId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!customer) {
      throw notFound('Your profile is not ready yet. Try again in a moment.');
    }

    const service = await prisma.service.findFirst({
      where: { slug: input.serviceSlug, isActive: true },
      select: { id: true },
    });
    if (!service) {
      throw badRequest('That service is no longer bookable.');
    }

    const skill = await prisma.skill.findFirst({
      where: { slug: input.skillSlug, serviceId: service.id, isActive: true },
      select: { id: true },
    });
    if (!skill) {
      throw badRequest('That job category does not belong to the chosen service.');
    }

    const customSkill = input.customSkill ?? null;
    if (input.skillSlug === 'other' && !customSkill) {
      throw badRequest('Tell us what you need done.');
    }
    if (input.skillSlug !== 'other' && customSkill) {
      throw badRequest('Only the "Other" category takes a custom skill.');
    }

    // Every submitted path must be scoped to this caller and must point at an
    // object that really reached storage. Without the scope check a customer
    // could reference another account's photos; without the existence check a
    // job could point at nothing at all.
    const scoped = input.imagePaths.every((path) => path.startsWith(jobImageScope(customerUserId)));
    if (!scoped) {
      throw badRequest('One of the photos is not valid.');
    }
    const uploaded = await Promise.all(
      input.imagePaths.map((path) => storage.jobImageExists(path)),
    );
    if (uploaded.some((exists) => !exists)) {
      throw badRequest('One of the photos did not finish uploading. Try again.');
    }

    const created = await prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          customerId: customer.id,
          serviceId: service.id,
          skillId: skill.id,
          customSkill,
          status: JobStatus.REQUESTED,
          placeType: input.placeType,
          placeDescription: input.placeType === 'OTHER' ? (input.placeDescription ?? null) : null,
          description: input.description,
          imagePaths: input.imagePaths,
          basePayPaise: input.basePayPaise,
        },
        include: jobDetailInclude,
      });

      await tx.jobStatusHistory.create({
        data: { jobId: job.id, fromStatus: null, toStatus: JobStatus.REQUESTED },
      });

      return job;
    });

    // Nudge eligible pros that a job is open, but only when there is a
    // location to match against — the pull-style available-jobs feed is the
    // source of truth either way.
    if (customer.latitude !== null && customer.longitude !== null) {
      const eligible = await matching.findEligiblePros({
        serviceId: service.id,
        latitude: customer.latitude,
        longitude: customer.longitude,
      });
      if (eligible.length > 0) {
        const payload = toJobDto(created as unknown as JobRow, storage);
        deps.realtime.emitToUsers(
          eligible.map((pro) => pro.userId),
          REALTIME_EVENTS.JOB_NEW,
          payload,
        );
      }
    }

    return toJobDetail(created as unknown as JobDetailRow, 'customer', storage);
  }

  /**
   * The caller's own requests, newest first. A bounded recent list; full cursor
   * pagination lands with the bookings feed that needs it.
   */
  async function listForCustomer(customerUserId: string, limit: number): Promise<JobDetail[]> {
    const customer = await prisma.customerProfile.findUnique({ where: { userId: customerUserId } });
    if (!customer) return [];

    const rows = await prisma.job.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 50)),
      include: jobDetailInclude,
    });
    return rows.map((row) => toJobDetail(row as unknown as JobDetailRow, 'customer', storage));
  }

  /** One of the caller's requests, or a 404 that hides whether it exists at all. */
  async function getForCustomer(customerUserId: string, jobId: string): Promise<JobDetail> {
    const row = await prisma.job.findFirst({
      where: { id: jobId, customer: { userId: customerUserId } },
      include: jobDetailInclude,
    });
    if (!row) throw notFound('That booking could not be found.');
    return toJobDetail(row as unknown as JobDetailRow, 'customer', storage);
  }

  /**
   * A customer settles a completed job: PAYMENT_PENDING → PAID. Exactly once.
   */
  async function payForCustomer(customerUserId: string, jobId: string): Promise<JobDetail> {
    let proUserId: string | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, customerId: customerUserId },
        include: {
          ...jobDetailInclude,
          pro: { select: { id: true, userId: true, displayName: true, rating: true } },
        },
      });
      if (!row) throw notFound('That booking could not be found.');
      if (!canTransition(row.status, JobStatus.PAID)) {
        throw conflict('Only a completed job can be paid.');
      }

      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: row.status,
          toStatus: JobStatus.PAID,
          changedById: customerUserId,
          note: 'Paid by the customer.',
        },
      });
      await tx.job.update({
        where: { id: row.id },
        data: { status: JobStatus.PAID },
      });

      if (row.pro) {
        proUserId = row.pro.userId;
        await tx.proProfile.update({
          where: { id: row.pro.id },
          data: { completedJobs: { increment: 1 } },
        });
      }

      return tx.job.findFirstOrThrow({ where: { id: row.id }, include: jobDetailInclude });
    });

    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    realtime.emitToUser(customerUserId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    if (proUserId) {
      realtime.emitToUser(
        proUserId,
        REALTIME_EVENTS.JOB_STATUS,
        toJobDetail(updated as unknown as JobDetailRow, 'pro', storage),
      );
    }
    return customerDetail;
  }

  /**
   * Cancels a job. Applies to its customer or its assigned pro.
   *
   * The actor is resolved from the verified token; the job is scoped to their
   * own involvement, so neither side can cancel a job they are not part of.
   */
  async function cancelJob(
    actorUserId: string,
    jobId: string,
    note?: string,
  ): Promise<{ detail: JobDetail; customerUserId: string; proUserId: string | null }> {
    const row = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customer: { select: { userId: true } }, pro: { select: { userId: true } } },
    });
    if (!row) throw notFound('That job could not be found.');

    const actorIsCustomer = row.customer.userId === actorUserId;
    if (!actorIsCustomer && !(row.pro && row.pro.userId === actorUserId)) {
      throw forbidden('You are not part of this job.');
    }
    if (!actorIsCustomer && !row.pro) {
      throw conflict('A professional is not assigned to this job.');
    }

    if (!canTransition(row.status, JobStatus.CANCELLED)) {
      throw conflict('This job can no longer be cancelled.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: row.status,
          toStatus: JobStatus.CANCELLED,
          changedById: actorUserId,
          note:
            note ?? `${actorIsCustomer ? 'The customer' : 'The professional'} cancelled the job.`,
        },
      });
      return tx.job.update({
        where: { id: row.id },
        data: { status: JobStatus.CANCELLED, cancelledAt: new Date() },
        include: jobDetailInclude,
      });
    });

    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage);
    realtime.emitToUser(row.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    if (row.pro) realtime.emitToUser(row.pro.userId, REALTIME_EVENTS.JOB_STATUS, proDetail);

    return {
      detail: actorIsCustomer ? customerDetail : proDetail,
      customerUserId: row.customer.userId,
      proUserId: row.pro?.userId ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Pro side
  // -------------------------------------------------------------------------

  /**
   * The jobs assigned to a pro, newest first.
   */
  async function listProJobs(
    proUserId: string,
    options: { status?: JobStatus; limit?: number } = {},
  ): Promise<JobDetail[]> {
    const pro = await findProByUserId(proUserId);
    const rows = await prisma.job.findMany({
      where: { proId: pro.id, ...(options.status ? { status: options.status } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 50, 50)),
      include: jobDetailInclude,
    });
    return rows.map((row) => toJobDetail(row as unknown as JobDetailRow, 'pro', storage));
  }

  /**
   * Open (REQUESTED, unassigned) jobs the pro serves, distance-first.
   *
   * Distance is measured between the pro and the customer's saved location —
   * the jobs table carries no coordinates of its own. Eligibility (online,
   * onboarded, within radius, not busy) is enforced at accept time, not on
   * this read, so the pool stays cheap and honest.
   */
  async function listAvailableJobs(
    proUserId: string,
    options: { limit?: number } = {},
  ): Promise<AvailableJob[]> {
    const pro = await findProByUserId(proUserId);

    const myServices = await prisma.proService.findMany({
      where: { proProfileId: pro.id },
      select: { serviceId: true },
    });
    const serviceIds = myServices.map((entry) => entry.serviceId);
    if (serviceIds.length === 0) return [];

    const rows = await prisma.job.findMany({
      where: {
        status: JobStatus.REQUESTED,
        proId: null,
        serviceId: { in: serviceIds },
      },
      include: { ...jobDetailInclude, customer: { select: { latitude: true, longitude: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 30, 50)),
    });

    const proPoint =
      pro.latitude !== null && pro.longitude !== null
        ? { latitude: pro.latitude, longitude: pro.longitude }
        : null;

    return rows.map((row) => {
      const customerPoint =
        row.customer.latitude !== null && row.customer.longitude !== null
          ? { latitude: row.customer.latitude, longitude: row.customer.longitude }
          : null;
      const km = proPoint && customerPoint ? distanceKm(proPoint, customerPoint) : null;
      return {
        ...toJobDto(row as unknown as JobRow, storage),
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
      };
    });
  }

  /**
   * Accepts an open job atomically. The first eligible pro to claim it wins.
   */
  async function acceptJob(proUserId: string, jobId: string): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, status: JobStatus.REQUESTED, proId: null },
        include: { ...jobDetailInclude, customer: { select: { latitude: true, longitude: true } } },
      });
      if (!row) throw notFound('This job is no longer open.');

      const busy = await tx.job.count({
        where: { proId: pro.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      });
      if (busy > 0) throw conflict('You already have a job in progress.');

      const customerPoint =
        row.customer.latitude !== null && row.customer.longitude !== null
          ? { latitude: row.customer.latitude, longitude: row.customer.longitude }
          : null;
      if (!customerPoint) {
        throw conflict('This job has no location to match against.');
      }
      const eligible = await matching.isProEligible(pro.id, {
        serviceId: row.serviceId,
        latitude: customerPoint.latitude,
        longitude: customerPoint.longitude,
      });
      if (!eligible) throw conflict('This job is outside your service area.');

      // The `proId: null` guard makes a double acceptance impossible: a racing
      // second transaction touches zero rows.
      const claimed = await tx.job.updateMany({
        where: { id: row.id, status: JobStatus.REQUESTED, proId: null },
        data: {
          status: JobStatus.ACCEPTED,
          proId: pro.id,
          acceptedAt: new Date(),
          agreedPayPaise: row.basePayPaise,
        },
      });
      if (claimed.count !== 1) throw conflict('This job was already assigned.');

      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: JobStatus.REQUESTED,
          toStatus: JobStatus.ACCEPTED,
          changedById: proUserId,
          note: 'Accepted by a professional.',
        },
      });

      return tx.job.findFirstOrThrow({ where: { id: row.id }, include: jobDetailInclude });
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage);
    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customerId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    return proDetail;
  }

  /**
   * The on-site stages driven by the assigned pro. Completing the job anchors
   * the price server-side and moves it to PAYMENT_PENDING in the same
   * transaction.
   */
  async function transitionJob(
    proUserId: string,
    jobId: string,
    action: JobAction,
    note?: string,
  ): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);

    const target =
      action === 'travel'
        ? JobStatus.TRAVELLING
        : action === 'arrived'
          ? JobStatus.ARRIVED
          : action === 'start'
            ? JobStatus.IN_PROGRESS
            : JobStatus.COMPLETED;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, proId: pro.id },
        include: jobDetailInclude,
      });
      if (!row) throw notFound('This job is not assigned to you.');
      if (!canTransition(row.status, target)) {
        throw conflict(`A job cannot move from ${row.status} to ${target}.`);
      }

      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: row.status,
          toStatus: target,
          changedById: proUserId,
          note,
        },
      });

      const isComplete = action === 'complete';
      const next = await tx.job.update({
        where: { id: row.id },
        data: isComplete
          ? {
              status: JobStatus.PAYMENT_PENDING,
              completedAt: new Date(),
              // The server anchors the price; a client can never set it.
              finalPayPaise: row.agreedPayPaise ?? row.basePayPaise,
            }
          : { status: target },
        include: jobDetailInclude,
      });

      if (isComplete) {
        // COMPLETED is the documented half of the IN_PROGRESS → COMPLETED →
        // PAYMENT_PENDING chain; the row carries the terminal money state.
        await tx.jobStatusHistory.create({
          data: {
            jobId: row.id,
            fromStatus: JobStatus.COMPLETED,
            toStatus: JobStatus.PAYMENT_PENDING,
            changedById: proUserId,
            note: 'Awaiting payment from the customer.',
          },
        });
      }

      return next;
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage);
    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customerId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    return proDetail;
  }

  return {
    createForCustomer,
    listForCustomer,
    getForCustomer,
    payForCustomer,
    cancelJob,
    listProJobs,
    listAvailableJobs,
    acceptJob,
    transitionJob,
  };
}

export type JobsService = ReturnType<typeof createJobsService>;
