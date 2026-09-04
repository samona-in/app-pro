import {
  JobStatus,
  NotificationKind,
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
import type { AppConfig } from '../config';
import { badRequest, notFound, conflict, forbidden } from '../common/errors';
import { distanceKm, etaMinutes } from '../common/geo';
import type { NotificationsService } from '../notifications/notifications.service';

export interface JobsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  matching: MatchingService;
  realtime: RealtimeService;
  notifications: NotificationsService;
  config: AppConfig;
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
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
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
    locationLabel: row.locationLabel,
    latitude: row.latitude,
    longitude: row.longitude,
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
            // The job's own snapshotted label, not the customer's saved one —
            // they may be booking from a different place than their profile.
            locationLabel: row.locationLabel,
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
  const { prisma, storage, matching, realtime, notifications, config } = deps;

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
      select: { id: true, locationLabel: true, latitude: true, longitude: true },
    });
    if (!customer) {
      throw notFound('Your profile is not ready yet. Try again in a moment.');
    }

    const service = await prisma.service.findFirst({
      where: { slug: input.serviceSlug, isActive: true },
      select: { id: true, name: true },
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

    // Work location for this job, snapshotted at creation. Coordinates come
    // from the booking if provided (a pair), otherwise we fall back to the
    // customer's saved profile location. Either way what matters is what is
    // stored on the job — later profile edits must not move a placed booking.
    const submittedCoords =
      input.latitude !== undefined && input.longitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : null;
    const coords =
      submittedCoords ??
      (customer.latitude !== null && customer.longitude !== null
        ? { latitude: customer.latitude, longitude: customer.longitude }
        : null);
    const locationLabel = input.locationLabel ?? customer.locationLabel;

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
          locationLabel,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
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
    if (coords) {
      const eligible = await matching.findEligiblePros({
        serviceId: service.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (eligible.length > 0) {
        const payload = toJobDto(created as unknown as JobRow, storage);
        deps.realtime.emitToUsers(
          eligible.map((pro) => pro.userId),
          REALTIME_EVENTS.JOB_NEW,
          payload,
        );

        // Push alert every eligible pro, then keep repeating on a cadence
        // until one accepts or the job leaves the open pool. This is what
        // reaches a pro whose phone is locked, in a pocket, or asleep — the
        // socket cannot.
        void notifications.alertEligiblePros(
          eligible.map((pro) => ({ proId: pro.proId })),
          {
            jobId: created.id,
            serviceName: service.name,
            customSkill,
            description: input.description,
            basePayPaise: input.basePayPaise,
          },
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
      const customer = await tx.customerProfile.findUnique({
        where: { userId: customerUserId },
      });
      if (!customer) throw notFound('That booking could not be found.');
      const row = await tx.job.findFirst({
        where: { id: jobId, customerId: customer.id },
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
    _note?: string,
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

    // A cancelled job is no longer open; stop repeating its alert.
    void notifications.resolveJobAlerts(jobId);

    // If a pro was freed up by this cancellation, re-nudge them only with jobs
    // that arrived after they accepted the cancelled job (the ones they truly
    // missed while committed to it) and only while they are still online.
    if (row.pro) {
      const proProfile = await prisma.proProfile.findUnique({
        where: { userId: row.pro.userId },
        select: { latitude: true, longitude: true, isOnline: true },
      });
      if (
        proProfile &&
        proProfile.isOnline &&
        proProfile.latitude !== null &&
        proProfile.longitude !== null
      ) {
        void notifyReadyJobRequests(
          row.pro.userId,
          {
            latitude: proProfile.latitude,
            longitude: proProfile.longitude,
          },
          { createdAfter: row.acceptedAt ?? undefined },
        );
      }
    }

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
      include: jobDetailInclude,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 30, 50)),
    });

    const proPoint =
      pro.latitude !== null && pro.longitude !== null
        ? { latitude: pro.latitude, longitude: pro.longitude }
        : null;

    return rows.map((row) => {
      const jobPoint =
        row.latitude !== null && row.longitude !== null
          ? { latitude: row.latitude, longitude: row.longitude }
          : null;
      const km = proPoint && jobPoint ? distanceKm(proPoint, jobPoint) : null;
      return {
        ...toJobDto(row as unknown as JobRow, storage),
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
      };
    });
  }

  /**
   * One open request by id, for the pro the alert just landed on.
   *
   * The client's incoming-job alert re-fetches a `job:new` nudge by id before
   * it shows anything, so a pro must be able to read a single open, unassigned
   * request they serve. Enforced the same way the available feed is: the pro
   * must exist and the job must be open, unassigned and one of their services —
   * nothing id-based from the client is trusted. 404s once the request is no
   * longer open (claimed, cancelled) so the alert resolves as unavailable.
   */
  async function getAvailableJobForPro(proUserId: string, jobId: string): Promise<AvailableJob> {
    const pro = await findProByUserId(proUserId);

    const myServices = await prisma.proService.findMany({
      where: { proProfileId: pro.id },
      select: { serviceId: true },
    });
    const serviceIds = myServices.map((entry) => entry.serviceId);
    if (serviceIds.length === 0) {
      throw notFound('That request is no longer available.');
    }

    const row = await prisma.job.findFirst({
      where: {
        id: jobId,
        status: JobStatus.REQUESTED,
        proId: null,
        serviceId: { in: serviceIds },
      },
      include: jobDetailInclude,
    });
    if (!row) {
      throw notFound('That request is no longer available.');
    }

    const proPoint =
      pro.latitude !== null && pro.longitude !== null
        ? { latitude: pro.latitude, longitude: pro.longitude }
        : null;
    const jobPoint =
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null;
    const km = proPoint && jobPoint ? distanceKm(proPoint, jobPoint) : null;

    return {
      ...toJobDto(row as unknown as JobRow, storage),
      distanceKm: km,
      estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
    };
  }

  /**
   * The pro's job-request history: every request they were offered, newest
   * first.
   *
   * Each `JOB_ALERT` notification records one offer the pro was paged for, so
   * this is the source of the "past jobs" list — including requests nobody
   * accepted (the job simply left the open pool). One row per job per pro;
   * the job DTO carries its final status so the pro sees where each request
   * landed.
   */
  async function listJobHistory(
    proUserId: string,
    options: { limit?: number } = {},
  ): Promise<JobDetail[]> {
    const pro = await findProByUserId(proUserId);

    const rows = await prisma.notification.findMany({
      where: { proId: pro.id, kind: 'JOB_ALERT', job: { isNot: null } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(options.limit ?? 50, 50)),
      include: { job: { include: { ...jobDetailInclude } } },
    });

    const proPoint =
      pro.latitude !== null && pro.longitude !== null
        ? { latitude: pro.latitude, longitude: pro.longitude }
        : null;

    const results: JobDetail[] = [];
    for (const row of rows) {
      if (!row.job) continue;
      const jobPoint =
        row.job.latitude !== null && row.job.longitude !== null
          ? { latitude: row.job.latitude, longitude: row.job.longitude }
          : null;
      const km = proPoint && jobPoint ? distanceKm(proPoint, jobPoint) : null;
      results.push({
        ...toJobDto(row.job as unknown as JobRow, storage),
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
        customer: null,
        pro: null,
      });
    }
    return results;
  }

  /**
   * Accepts an open job atomically. The first eligible pro to claim it wins.
   */
  async function acceptJob(proUserId: string, jobId: string): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, status: JobStatus.REQUESTED, proId: null },
        include: jobDetailInclude,
      });
      if (!row) throw notFound('This job is no longer open.');

      const busy = await tx.job.count({
        where: { proId: pro.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      });
      if (busy > 0) throw conflict('You already have a job in progress.');

      const jobPoint =
        row.latitude !== null && row.longitude !== null
          ? { latitude: row.latitude, longitude: row.longitude }
          : null;
      if (!jobPoint) {
        throw conflict('This job has no location to match against.');
      }

      // Accepting requires the pro to be online — an offline pro cannot act on
      // a request. Surfaced as its own, clear error before radius checks.
      const online = await tx.proProfile.findFirst({
        where: { id: pro.id, isOnline: true },
        select: { id: true },
      });
      if (!online) throw conflict('Go online to accept jobs.');

      const eligible = await matching.isProEligible(pro.id, {
        serviceId: row.serviceId,
        latitude: jobPoint.latitude,
        longitude: jobPoint.longitude,
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
        },
      });

      return tx.job.findFirstOrThrow({ where: { id: row.id }, include: jobDetailInclude });
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage);
    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);

    // A job that is now assigned is no longer open: stop the repeating alert
    // still paging every other eligible pro.
    void notifications.resolveJobAlerts(jobId);

    // Every other pro who was alerted for this request should drop it the
    // instant it is claimed. Publishing the accepted status over their socket
    // closes their overlay and silences their alarm immediately, instead of
    // leaving them showing a dead request until the next validation poll.
    const others = await prisma.notification.findMany({
      where: {
        jobId,
        kind: NotificationKind.JOB_ALERT,
        resolvedAt: null,
        proId: { not: pro.id },
      },
      select: { pro: { select: { userId: true } } },
    });
    realtime.emitToUsers(
      others.map((n) => n.pro.userId),
      REALTIME_EVENTS.JOB_STATUS,
      proDetail,
    );

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
    _note?: string,
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
          },
        });
      }

      return next;
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage);
    const customerDetail = toJobDetail(updated as unknown as JobDetailRow, 'customer', storage);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    return proDetail;
  }

  /**
   * Catch-up: page a pro for still-open requests they are eligible for but that
   * were raised while they were busy (Rapido-style "you missed this" nudge).
   * Used both when a pro comes online and, with `createdAfter`, when a cancelled
   * job frees a pro who had been committed to it.
   *
   * Open requests are REQUESTED jobs with no assigned pro. Without `createdAfter`
   * the recency window is `config.jobCatchupWindowMs`; with it only jobs created
   * after the anchor (e.g. the cancelled job's acceptedAt) qualify, so the pro is
   * only re-shown jobs they truly missed while committed. The pro must still be
   * eligible (online, service, radius, no conflicting job) and must not already
   * have been alerted for the job (so we never double-nudge). Dispatches at most
   * `config.jobCatchupLimit` jobs, nearest first. Fire-and-forget callers should
   * not await this.
   */
  async function notifyReadyJobRequests(
    proUserId: string,
    coordinates: { latitude: number; longitude: number },
    options?: { createdAfter?: Date },
  ): Promise<void> {
    const pro = await prisma.proProfile.findUnique({
      where: { userId: proUserId },
      select: {
        id: true,
        serviceRadiusKm: true,
      },
    });
    if (!pro) return;
    const proPoint = coordinates;

    const openJobs = await prisma.job.findMany({
      where: {
        status: JobStatus.REQUESTED,
        proId: null,
        latitude: { not: null },
        longitude: { not: null },
        createdAt: options?.createdAfter
          ? { gt: options.createdAfter }
          : { gte: new Date(Date.now() - config.jobCatchupWindowMs) },
      },
      include: jobDetailInclude,
    });

    if (openJobs.length === 0) return;

    // Drop jobs the pro has already been alerted for, dedupe against the
    // unique proId_jobId_kind constraint.
    const alerted = await prisma.notification.findMany({
      where: {
        proId: pro.id,
        kind: NotificationKind.JOB_ALERT,
        jobId: { in: openJobs.map((j) => j.id) },
      },
      select: { jobId: true },
    });
    const alertedIds = new Set(alerted.map((n) => n.jobId));

    const candidates = openJobs
      .filter((job) => !alertedIds.has(job.id))
      .map((job) => {
        const jobPoint = { latitude: job.latitude as number, longitude: job.longitude as number };
        return { job, km: distanceKm(proPoint, jobPoint) };
      })
      .filter(({ job, km }) => job.latitude !== null && job.longitude !== null && km <= pro.serviceRadiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, config.jobCatchupLimit);

    for (const { job, km } of candidates) {
      const eligible = await matching.isProEligible(pro.id, {
        serviceId: job.serviceId,
        latitude: job.latitude as number,
        longitude: job.longitude as number,
      });
      if (!eligible) continue;

      const payload: AvailableJob = {
        ...toJobDto(job as unknown as JobRow, storage),
        distanceKm: km,
        estimatedEtaMinutes: etaMinutes(km),
      };

      realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_NEW, payload);
      void notifications.alertEligiblePros(
        [{ proId: pro.id }],
        {
          jobId: job.id,
          serviceName: job.service.name,
          customSkill: job.customSkill,
          description: job.description,
          basePayPaise: job.basePayPaise,
        },
      );
    }
  }

  return {
    createForCustomer,
    listForCustomer,
    getForCustomer,
    payForCustomer,
    cancelJob,
    listProJobs,
    listAvailableJobs,
    getAvailableJobForPro,
    listJobHistory,
    notifyReadyJobRequests,
    acceptJob,
    transitionJob,
  };
}

export type JobsService = ReturnType<typeof createJobsService>;
