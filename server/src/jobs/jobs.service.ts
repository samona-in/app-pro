import {
  JobStatus,
  NotificationKind,
  ACTIVE_JOB_STATUSES,
  canTransition,
  type Job,
  type JobDetail,
  type AvailableJob,
} from '@samona/types';
import { randomInt } from 'node:crypto';
import type { CreateJobInput, JobAction } from '@samona/validation';
import { JOB_DEFAULTS } from '@samona/config';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { RealtimeService } from '../realtime/gateway';
import { REALTIME_EVENTS } from '../realtime/gateway';
import type { MatchingService } from '../matching/matching.service';
import type { AppConfig } from '../config';
import { badRequest, notFound, conflict, forbidden, createHttpError } from '../common/errors';
import { ApiErrorCode } from '@samona/types';
import { distanceKm, etaMinutes } from '../common/geo';
import { logger } from '../common/logger';
import { safeEqual, type BruteForceGuard } from '../common';
import type { NotificationsService } from '../notifications/notifications.service';
import { hashJobOfferToken, verifyJobOffer } from './job-offers';

export interface JobsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  matching: MatchingService;
  realtime: RealtimeService;
  notifications: NotificationsService;
  config: AppConfig;
  /**
   * Per-identity lockout keyed by the job being targeted, so a wrong start code
   * cannot be sprayed even across many callers. With no Redis it degrades to
   * per-request counting (see `recordFailure`) — never fails open silently.
   */
  startOtpGuard?: BruteForceGuard;
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

/** Formats paise as a whole rupee string for customer-notice copy. */
function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * A cryptographically-random, fixed-length numeric code (padded so leading
 * zeros survive), used for the customer-to-pro start-work verification.
 */
function generateStartOtp(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}

/**
 * Records a customer notice without ever making the primary transition await
 * it. A notice write is a display side effect: it must not turn an already
 * committed accept/travel/complete/pay into a 500, nor lose the state change.
 * Failures are logged loudly, never swallowed.
 */
function recordCustomerNotice(
  notifications: NotificationsService,
  notice: Parameters<NotificationsService['recordCustomerNotification']>[0],
): void {
  void notifications.recordCustomerNotification(notice).catch((error: unknown) => {
    logger.error(`Failed to record a customer notice for job ${notice.jobId}.`, error);
  });
}

/**
 * Records a customer notice and pushes the same headline as a job-status
 * notification. Both are display side effects: neither ever awaits the primary
 * transition, and a failed push (unregistered token, transient FCM/Expo error)
 * must not turn an already committed accept/status/payment into an error.
 * Failures are logged loudly, never swallowed.
 */
function notifyCustomer(
  notifications: NotificationsService,
  notice: Parameters<NotificationsService['recordCustomerNotification']>[0] & { jobId: string },
): void {
  recordCustomerNotice(notifications, notice);
  void notifications
    .sendCustomerPush({
      userId: notice.customerUserId,
      jobId: notice.jobId,
      title: notice.title,
      body: notice.body,
      type: 'JOB_STATUS',
    })
    .catch((error: unknown) => {
      logger.error(`Failed to push a customer status notice for job ${notice.jobId}.`, error);
    });
}

/** The projection job *detail* reads use: counterparty identity + coordinates. */
// `verificationOtp` is a scalar on Job and is returned with every include-based
// read automatically — it must not appear in this relation projection (Prisma
// rejects a scalar in `include`). `toJobDetail` decides who sees it.
const jobDetailInclude = {
  ...jobInclude,
  customer: {
    select: {
      userId: true,
      displayName: true,
      locationLabel: true,
      latitude: true,
      longitude: true,
      // Contact number, shared once the job is accepted so the pro can call.
      // Lives on the shared identity row, not the surface profile.
      profile: { select: { phone: true } },
    },
  },
  pro: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      rating: true,
      selfiePhotoPath: true,
      profile: { select: { phone: true } },
    },
  },
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
  acceptedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
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
  verificationOtp: string | null;
  customer: {
    userId: string;
    displayName: string | null;
    locationLabel: string | null;
    latitude: number | null;
    longitude: number | null;
    profile: { phone: string | null };
  };
  pro: {
    id: string;
    userId: string;
    displayName: string | null;
    rating: number | null;
    profile: { phone: string | null };
    selfiePhotoPath: string | null;
  } | null;
};

const iso = (d: Date): string => d.toISOString();

function toJobDto(row: JobRow, storage: StorageService, config: AppConfig): Job {
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
    // The one deadline a client needs (offer window, countdown) and the sweep
    // that turns the job EXPIRED use the same value: the FCM push already
    // computed this exact moment, so the DTO keeps every surface in step with
    // it. Computed for every job — a client that no longer needs the deadline
    // just ignores the field.
    expiresAt: new Date(row.createdAt.getTime() + config.jobExpireTtlMs).toISOString(),
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
  config: AppConfig,
): JobDetail {
  const assigned = row.status !== JobStatus.REQUESTED && row.status !== JobStatus.OFFERED;
  return {
    ...toJobDto(row, storage, config),
    acceptedAt: row.acceptedAt ? iso(row.acceptedAt) : null,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    // Cancellation identity is stamped by the transition that produces it
    // (`cancelJob`), so a detail read of an already-cancelled job can still
    // answer "who cancelled" for the party it reaches. Non-cancelled reads
    // default both to null.
    cancelledAt: row.cancelledAt ? iso(row.cancelledAt) : null,
    cancelledBy: null,
    distanceKm: null,
    estimatedEtaMinutes: null,
    // The start-work code is customer-only by design: it is never shipped to
    // the pro's view, so the pro must read it back from the customer's device
    // (CLAUDE.md "Security"). A pro may only prove possession by submitting it.
    verificationOtp: forViewer === 'customer' ? row.verificationOtp : null,
    customer:
      forViewer === 'pro' && assigned && row.customer
        ? {
            userId: row.customer.userId,
            displayName: row.customer.displayName,
            // The job's own snapshotted label, not the customer's saved one —
            // they may be booking from a different place than their profile.
            locationLabel: row.locationLabel,
            // Contact share: once a pro commits, the customer's number is
            // needed to coordinate the job in person.
            phone: row.customer.profile.phone,
          }
        : null,
    pro:
      forViewer === 'customer' && assigned && row.pro
        ? {
            proId: row.pro.id,
            displayName: row.pro.displayName,
            rating: row.pro.rating,
            phone: row.pro.profile.phone,
            // The pro's verified selfie is their requester-facing face photo.
            photoUrl: row.pro.selfiePhotoPath
              ? storage.selfiePublicUrl(row.pro.selfiePhotoPath)
              : null,
          }
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
  const { prisma, storage, matching, realtime, notifications, config, startOtpGuard } = deps;

  const findProByUserId = async (userId: string) => {
    const pro = await prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, latitude: true, longitude: true },
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
      select: { id: true, name: true },
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
        const payload = toJobDto(created as unknown as JobRow, storage, config);
        deps.realtime.emitToUsers(
          eligible.map((pro) => pro.userId),
          REALTIME_EVENTS.JOB_NEW,
          payload,
        );

        // Push alert every eligible pro, then keep repeating on a cadence
        // until one accepts or the job leaves the open pool. This is what
        // reaches a pro whose phone is locked, in a pocket, or asleep — the
        // socket cannot. Distance is per pro (from the match) and the address
        // is the job's own snapshotted label, never the customer's identity.
        void notifications.alertEligiblePros(
          eligible.map((pro) => ({ proId: pro.proId, distanceKm: pro.distanceKm })),
          {
            jobId: created.id,
            serviceName: service.name,
            serviceCategory: customSkill ?? skill.name,
            customSkill,
            description: input.description,
            basePayPaise: input.basePayPaise,
            address: locationLabel,
            expiresAt: new Date(created.createdAt.getTime() + config.jobExpireTtlMs).toISOString(),
          },
        );
      }
    }

    return toJobDetail(created as unknown as JobDetailRow, 'customer', storage, config);
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
    return rows.map((row) =>
      toJobDetail(row as unknown as JobDetailRow, 'customer', storage, config),
    );
  }

  /** One of the caller's requests, or a 404 that hides whether it exists at all. */
  async function getForCustomer(customerUserId: string, jobId: string): Promise<JobDetail> {
    const row = await prisma.job.findFirst({
      where: { id: jobId, customer: { userId: customerUserId } },
      include: jobDetailInclude,
    });
    if (!row) throw notFound('That booking could not be found.');
    return toJobDetail(row as unknown as JobDetailRow, 'customer', storage, config);
  }

  /**
   * A pro settles a completed job in cash on the doorstep: COMPLETED (or
   * PAYMENT_PENDING) → PAID.
   *
   * Payments are cash-only today: the customer never settles online, so this
   * is the single path to PAID and the pro's terminal step — the one they
   * reach from the "Collected cash" screen after completing. The status passes
   * through PAYMENT_PENDING on the way so the audit timeline records both the
   * completion and the collection. Exactly once: a repeat call on an
   * already-PAID job is a harmless no-op returning the job unchanged.
   */
  async function collectCashForPro(proUserId: string, jobId: string): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, proId: pro.id },
        include: jobDetailInclude,
      });
      if (!row) throw notFound('That job could not be found.');
      if (row.status === JobStatus.PAID) return row;
      const isPending = row.status === JobStatus.PAYMENT_PENDING;
      if (!isPending && !canTransition(row.status, JobStatus.PAYMENT_PENDING)) {
        throw conflict(`Cash can only be collected once the work is done (state: ${row.status}).`);
      }

      // Record the completion → collection steps, even though both land in the
      // one cash settlement, so the timeline tells the full story. A job
      // already sitting in PAYMENT_PENDING skips the first row.
      if (!isPending) {
        await tx.jobStatusHistory.create({
          data: {
            jobId: row.id,
            fromStatus: row.status,
            toStatus: JobStatus.PAYMENT_PENDING,
            changedById: proUserId,
          },
        });
      }
      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: JobStatus.PAYMENT_PENDING,
          toStatus: JobStatus.PAID,
          changedById: proUserId,
        },
      });

      await tx.job.update({
        where: { id: row.id },
        data: { status: JobStatus.PAID },
      });
      await tx.proProfile.update({
        where: { id: pro.id },
        data: { completedJobs: { increment: 1 } },
      });

      return tx.job.findFirstOrThrow({ where: { id: row.id }, include: jobDetailInclude });
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage, config);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(
      updated.customer.userId,
      REALTIME_EVENTS.JOB_STATUS,
      toJobDetail(updated as unknown as JobDetailRow, 'customer', storage, config),
    );

    notifyCustomer(notifications, {
      customerId: updated.customerId,
      customerUserId: updated.customer.userId,
      jobId: updated.id,
      kind: NotificationKind.PAYMENT,
      title:
        updated.finalPayPaise !== null
          ? `Payment received · ${formatPaise(updated.finalPayPaise)}`
          : 'Payment received',
      body: `${updated.service.name} · collected in cash`,
      route: `/booking/${updated.id}`,
    });
    return proDetail;
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

    const cancelledBy = actorIsCustomer ? ('customer' as const) : ('pro' as const);
    const customerDetail = toJobDetail(
      updated as unknown as JobDetailRow,
      'customer',
      storage,
      config,
    );
    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage, config);
    realtime.emitToUser(row.customer.userId, REALTIME_EVENTS.JOB_STATUS, {
      ...customerDetail,
      cancelledBy,
    });
    if (row.pro) {
      realtime.emitToUser(row.pro.userId, REALTIME_EVENTS.JOB_STATUS, {
        ...proDetail,
        cancelledBy,
      });
    }

    // When the pro backs out, the customer hears about it. A customer-initiated
    // cancellation is their own action — no own-notice — but the page already
    // states the outcome in place.
    if (!actorIsCustomer) {
      notifyCustomer(notifications, {
        customerId: updated.customerId,
        customerUserId: row.customer.userId,
        jobId: updated.id,
        kind: NotificationKind.JOB_STATUS,
        title: 'Booking cancelled',
        body: `${updated.pro?.displayName ?? 'Your professional'} · ${updated.service.name}`,
        route: `/booking/${updated.id}`,
      });
    }

    // A cancelled job is no longer open; stop repeating its alert and page its
    // holders so their native overlay/sound/tray entry closes immediately.
    void notifications.resolveJobAlerts(jobId, 'CANCELLED');

    // The assigned pro never holds an open offer alert, so the terminal push
    // above can never reach them. A customer-initiated cancellation must still
    // alert them when their app process is dead or the screen is off — send a
    // dedicated data push straight to the assigned pro.
    if (actorIsCustomer && row.pro && updated.cancelledAt) {
      void notifications.sendAssignedCancellationProPush(
        row.pro.userId,
        updated.id,
        updated.cancelledAt,
      );
    }

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
    return rows.map((row) => toJobDetail(row as unknown as JobDetailRow, 'pro', storage, config));
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
        // A request this pro explicitly declined must not resurface.
        declines: { none: { proId: pro.id } },
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
        ...toJobDto(row as unknown as JobRow, storage, config),
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
        // A request this pro explicitly declined must not resurface.
        declines: { none: { proId: pro.id } },
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
      ...toJobDto(row as unknown as JobRow, storage, config),
      distanceKm: km,
      estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
    };
  }

  /**
   * Records this pro's explicit decline of an open request and stops the
   * request from resurfacing for them.
   *
   * A decline is per pro per job (idempotent) and only applies while the job
   * is still open and unassigned. It resolves the pro's own job-alert rows so
   * the repeating push scheduler stops paging them, `/jobs/available` no longer
   * lists the job, and the alert refetch by id 404s — so reopening the app
   * (or tapping an older push) cannot bring a rejected request back. The job's
   * own status and the customer are untouched; a decline is invisible to the
   * customer purely because the request leaves this pro's pool.
   */
  async function declineJob(proUserId: string, jobId: string): Promise<void> {
    const pro = await findProByUserId(proUserId);

    const myServices = await prisma.proService.findMany({
      where: { proProfileId: pro.id },
      select: { serviceId: true },
    });
    const serviceIds = myServices.map((entry) => entry.serviceId);
    if (serviceIds.length === 0) throw notFound('That request is no longer available.');

    const open = await prisma.job.findFirst({
      where: {
        id: jobId,
        status: JobStatus.REQUESTED,
        proId: null,
        serviceId: { in: serviceIds },
      },
      select: { id: true },
    });
    if (!open) throw notFound('That request is no longer available.');

    await prisma.$transaction(async (tx) => {
      await tx.jobDecline.upsert({
        where: { jobId_proId: { jobId, proId: pro.id } },
        create: { jobId, proId: pro.id },
        update: {},
      });
      // Stop the repeating push scheduler from paging this pro for this job.
      await tx.notification.updateMany({
        where: { jobId, proId: pro.id, kind: NotificationKind.JOB_ALERT, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    });

    // Tell the pro's own devices the offer ended so the pending-offer UI drops
    // it without waiting for the countdown to prune it. Purely a notification;
    // the decline row above is the source of truth.
    realtime.emitToUser(pro.userId, REALTIME_EVENTS.JOB_OFFER_ENDED, { jobId });
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
        ...toJobDto(row.job as unknown as JobRow, storage, config),
        acceptedAt: row.job.acceptedAt ? iso(row.job.acceptedAt) : null,
        completedAt: row.job.completedAt ? iso(row.job.completedAt) : null,
        cancelledAt: row.job.cancelledAt ? iso(row.job.cancelledAt) : null,
        cancelledBy: null,
        distanceKm: km,
        estimatedEtaMinutes: km !== null ? etaMinutes(km) : null,
        verificationOtp: null,
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
    const updated = await claimOpenJob(pro, proUserId, jobId);
    return finalizeAccepted(proUserId, updated, pro.id);
  }

  /**
   * Atomically claims an open REQUESTED job for a pro. Every accept path — the
   * signed-in app (`acceptJob`) and the native overlay's single-use offer token
   * (`acceptJobWithOffer`) — funnels through here, so only one pro can ever win
   * a job no matter which surface arrives first.
   */
  async function claimOpenJob(
    pro: { id: string },
    proUserId: string,
    jobId: string,
  ): Promise<JobDetailRow> {
    return prisma.$transaction(async (tx) => {
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
  }

  /** The post-claim fan-out both accept paths share: emits, terminal pages. */
  async function finalizeAccepted(
    proUserId: string,
    updated: JobDetailRow,
    proId: string,
  ): Promise<JobDetail> {
    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage, config);
    const customerDetail = toJobDetail(
      updated as unknown as JobDetailRow,
      'customer',
      storage,
      config,
    );
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);

    // A job that is now assigned is no longer open: stop the repeating alert
    // still paging every other eligible pro, and page them with an accepted
    // terminal push so their native overlay/sound/tray entry drops at once.
    void notifications.resolveJobAlerts(updated.id, 'ACCEPTED');

    // Every other pro who was alerted for this request should drop it the
    // instant it is claimed. Publishing the accepted status over their socket
    // closes their overlay and silences their alarm immediately, instead of
    // leaving them showing a dead request until the next validation poll.
    const others = await prisma.notification.findMany({
      where: {
        jobId: updated.id,
        kind: NotificationKind.JOB_ALERT,
        resolvedAt: null,
        proId: { not: proId },
      },
      select: { pro: { select: { userId: true } } },
    });
    realtime.emitToUsers(
      others.map((n) => n.pro.userId),
      REALTIME_EVENTS.JOB_STATUS,
      proDetail,
    );

    // The customer hears about the booking being taken, in-app and via the
    // realtime nudge to their bell pill. This row is the source of truth for
    // their Notifications screen.
    notifyCustomer(notifications, {
      customerId: updated.customerId,
      customerUserId: updated.customer.userId,
      jobId: updated.id,
      kind: NotificationKind.JOB_STATUS,
      title: 'Booking accepted',
      body: `${updated.pro?.displayName ?? 'A professional'} · ${updated.service.name}`,
      route: `/booking/${updated.id}`,
    });

    return proDetail;
  }

  /**
   * Accepts a job via the signed, single-use offer token delivered inside the
   * native alert's push data. Untrusted caller (no JWT): the token itself is
   * the credential. Verifying the signature proves the token came from us; the
   * device claim ties it to the install the push was delivered to; the
   * `job_offers` ledger makes it redeemable exactly once. After the offer is
   * consumed the claim is the same transaction `acceptJob` uses, so whoever
   * actually wins is decided by the `proId` guard, never by arrival order.
   */
  async function acceptJobWithOffer(
    offerToken: string,
    deviceId: string,
    jobId: string,
  ): Promise<JobDetail> {
    const secret = config.jobOfferSecret;
    if (!secret) throw conflict('This offer is no longer valid.');

    const offer = verifyJobOffer(offerToken, secret);
    if (!offer || offer.jobId !== jobId) throw conflict('This offer is no longer valid.');
    if (offer.deviceId !== deviceId) throw conflict('This offer belongs to another device.');

    // Single-use: atomically flip the ledger row. Two replays race here and
    // exactly one wins; the loser gets the conflict below.
    const tokenHash = hashJobOfferToken(offerToken);
    const consumed = await prisma.jobOffer.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw conflict('This offer was already used.');

    const pro = await prisma.proProfile.findUnique({
      where: { id: offer.proId },
      select: { id: true, userId: true },
    });
    if (!pro) throw notFound('This offer is no longer valid.');

    try {
      const updated = await claimOpenJob(pro, pro.userId, jobId);
      await prisma.jobOffer.updateMany({
        where: { tokenHash },
        data: { outcome: 'ACCEPTED' },
      });
      return await finalizeAccepted(pro.userId, updated, pro.id);
    } catch (error) {
      // The token was consumed for good reason — a job can only keep the offer
      // open while it is winnable. Record where it landed; a later retry over
      // the same token is already dead.
      await prisma.jobOffer
        .updateMany({ where: { tokenHash }, data: { outcome: 'EXPIRED' } })
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * Declines a job via the signed, single-use offer token. Unlike accept this
   * is deliberately non-destructive: it records a `JobDecline`, stops the
   * repeating scheduler paging *this* pro, and leaves the job open for others.
   * Idempotent for the native side — replays of a consumed token are a no-op
   * 204, so the tray taps can fire more than once without harm.
   */
  async function rejectJobOffer(
    offerToken: string,
    deviceId: string,
    jobId: string,
  ): Promise<void> {
    const secret = config.jobOfferSecret;
    if (!secret) return;

    const offer = verifyJobOffer(offerToken, secret);
    if (!offer || offer.jobId !== jobId) return;
    if (offer.deviceId !== deviceId) throw conflict('This offer belongs to another device.');

    const tokenHash = hashJobOfferToken(offerToken);
    await prisma.jobOffer.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date(), outcome: 'REJECTED' },
    });

    const pro = await prisma.proProfile.findUnique({
      where: { id: offer.proId },
      select: { userId: true },
    });

    // Record the decline and resolve this pro's alert row so the scheduler
    // stops paging them for a job they have already turned down.
    await prisma.$transaction(async (tx) => {
      await tx.jobDecline.upsert({
        where: { jobId_proId: { jobId, proId: offer.proId } },
        create: { jobId, proId: offer.proId },
        update: {},
      });
      await tx.notification.updateMany({
        where: {
          jobId,
          proId: offer.proId,
          kind: NotificationKind.JOB_ALERT,
          resolvedAt: null,
        },
        data: { resolvedAt: new Date() },
      });
    });

    // The token path only ever runs when the app is open; the reject was
    // decided on the device that consumed it, but other surfaces (another
    // device, or a screen still showing the offer) need the same nudge that
    // the explicit `declineJob` path emits.
    if (pro) realtime.emitToUser(pro.userId, REALTIME_EVENTS.JOB_OFFER_ENDED, { jobId });
  }

  /**
   * The on-site stages driven by the assigned pro.
   *
   * Starting work is gated on proximity: the pro must be within
   * `JOB_DEFAULTS.arrivalRadiusMeters` of the work spot (their live position
   * is sent with the request), otherwise the transition fails closed and the
   * job stays ARRIVED. Completing the job anchors the price server-side and
   * lands it on COMPLETED — the move onwards to PAYMENT_PENDING is a distinct
   * later step once the customer settles, so the completed stage stays visible
   * as the pro's end point.
   */
  async function transitionJob(
    proUserId: string,
    jobId: string,
    action: JobAction,
    _note?: string,
    coordinates?: { latitude: number; longitude: number },
  ): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);

    // "Start work" no longer advances the status directly. The swipe mints the
    // one-time code the pro must then prove (verifyStart) before the job may
    // leave ARRIVED. A repeat swipe is a safe idempotent no-op: one job, one
    // code — the customer already holds it, so nothing is re-sent.
    if (action === 'start') {
      return issueStartOtp(proUserId, pro.id, jobId);
    }

    // The remaining on-site actions move through the state machine directly;
    // `start` was rerouted above, so the target here is never IN_PROGRESS.
    const target =
      action === 'travel'
        ? JobStatus.TRAVELLING
        : action === 'arrived'
          ? JobStatus.ARRIVED
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

      // Fail closed before any write: a pro must actually be at the work spot
      // before claiming arrival. Missing coordinates (a client that broke
      // contract) is treated the same as being too far away — never trust
      // location claims. Arrival is the last physical gate; the start-work code
      // is the identity gate that follows immediately after.
      if (action === 'arrived') {
        const jobPoint =
          row.latitude != null && row.longitude != null
            ? { latitude: row.latitude, longitude: row.longitude }
            : null;
        if (!jobPoint || !coordinates) {
          throw badRequest(
            'Your location is needed to confirm you have arrived. Please try again.',
          );
        }
        const metres = distanceKm(coordinates, jobPoint) * 1000;
        if (metres > JOB_DEFAULTS.arrivalRadiusMeters) {
          throw badRequest(
            `You must be within ${JOB_DEFAULTS.arrivalRadiusMeters} m of the work spot to confirm you have arrived.`,
          );
        }
      }

      const isComplete = action === 'complete';
      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: row.status,
          toStatus: isComplete ? JobStatus.COMPLETED : target,
          changedById: proUserId,
        },
      });

      // Completing anchors the price and stops at COMPLETED, which stays the
      // pro's visible end state. A later settle step moves it to
      // PAYMENT_PENDING; the anchor is decided here so no client can set it.
      const next = await tx.job.update({
        where: { id: row.id },
        data: isComplete
          ? {
              status: JobStatus.COMPLETED,
              completedAt: new Date(),
              finalPayPaise: row.agreedPayPaise ?? row.basePayPaise,
            }
          : { status: target },
        include: jobDetailInclude,
      });

      return next;
    });

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage, config);
    const customerDetail = toJobDetail(
      updated as unknown as JobDetailRow,
      'customer',
      storage,
      config,
    );
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);

    // Each on-site stage the pro reaches shows up on the customer's
    // Notifications screen too; labour stays visible, not something to poll for.
    // The title is the action (the row emphasises it); the body carries the
    // who + what once so the pro name is never shown twice.
    const proName = updated.pro?.displayName ?? 'Your professional';
    const serviceName = updated.service.name;
    const context = `${proName} · ${serviceName}`;
    // `start` returns early (issueStartOtp), so only travel/arrived/complete
    // reach here; the work-started notice is handled by verifyStart.
    const stageCopy =
      action === 'travel'
        ? { title: 'On the way', body: context }
        : action === 'arrived'
          ? { title: 'Arrived', body: context }
          : { title: 'Work complete', body: context };
    notifyCustomer(notifications, {
      customerId: updated.customerId,
      customerUserId: updated.customer.userId,
      jobId: updated.id,
      kind: NotificationKind.JOB_STATUS,
      title: stageCopy.title,
      body: stageCopy.body,
      route: `/booking/${updated.id}`,
    });
    return proDetail;
  }

  /**
   * Issues the one-time start-work code to the customer when a pro swipes
   * "Start Work".
   *
   * The job stays ARRIVED; this only mints a 4-digit code, delivers it to the
   * customer (in-app push, persisted notice, and a realtime nudge to their open
   * booking screen), and marks when it was issued. A repeat swipe returns the
   * same job unchanged — one job, one code — so a pro cannot mint a fresh code
   * or spam the customer's device.
   *
   * The code is never returned to the pro (pro view sets it null); the pro must
   * read it back from the customer and prove possession via `verifyStart`.
   */
  async function issueStartOtp(
    proUserId: string,
    proId: string,
    jobId: string,
  ): Promise<JobDetail> {
    const { row, issued } = await prisma.$transaction(async (tx) => {
      const current = await tx.job.findFirst({
        where: { id: jobId, proId },
        include: jobDetailInclude,
      });
      if (!current) throw notFound('This job is not assigned to you.');
      if (current.status !== JobStatus.ARRIVED) {
        throw conflict(
          `The start code can only be issued once the pro has arrived (state: ${current.status}).`,
        );
      }
      if (current.verificationOtp) return { row: current, issued: false };

      const otp = generateStartOtp(JOB_DEFAULTS.startOtpLength);
      const updated = await tx.job.update({
        where: { id: current.id },
        data: { verificationOtp: otp, otpIssuedAt: new Date() },
        include: jobDetailInclude,
      });
      return { row: updated, issued: true };
    });

    // Deliver the code to the customer only when it was newly minted. A push is
    // a courtesy — it must never fail the issuance, since the code also shows
    // in-app on the customer's booking screen.
    if (issued) {
      try {
        await notifications.sendCustomerPush({
          userId: row.customer.userId,
          jobId: row.id,
          title: 'Your verification code is ready',
          body: `Share the 4-digit code with ${row.pro?.displayName ?? 'your professional'} to start the work.`,
        });
      } catch (error) {
        logger.error(
          `Failed to push the start-work code for job ${row.id} to the customer.`,
          error,
        );
      }
      recordCustomerNotice(notifications, {
        customerId: row.customerId,
        customerUserId: row.customer.userId,
        jobId: row.id,
        kind: NotificationKind.JOB_STATUS,
        title: 'Your verification code is ready',
        body: 'Open this booking to find the 4-digit code to share with your professional.',
        route: `/booking/${row.id}`,
      });
    }

    const proDetail = toJobDetail(row as unknown as JobDetailRow, 'pro', storage, config);
    const customerDetail = toJobDetail(row as unknown as JobDetailRow, 'customer', storage, config);
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(row.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);
    return proDetail;
  }

  /**
   * Verifies the pro's claim to start work by checking the one-time code the
   * customer holds, then advances ARRIVED → IN_PROGRESS on success.
   *
   * The code is compared in constant time, and a wrong code is counted both on
   * the row and (with a guard provided) in a per-identity Redis lockout keyed by
   * the job, so it cannot be sprayed across many callers. A correct code is
   * consumed (nulled) so it works exactly once; the pro view never receives it.
   */
  async function verifyStart(proUserId: string, jobId: string, code: string): Promise<JobDetail> {
    const pro = await findProByUserId(proUserId);
    const identifier = `job:${jobId}`;

    if (startOtpGuard) {
      const status = await startOtpGuard.check(identifier);
      if (status.locked) {
        throw createHttpError(
          429,
          ApiErrorCode.RATE_LIMITED,
          `Too many wrong codes. Try again in ${Math.max(1, Math.ceil(status.retryAfterSeconds / 60))} minutes.`,
        );
      }
    }

    // Read and compare outside the write transaction so a wrong code never
    // consumes a transaction; the transition below re-validates atomically.
    const current = await prisma.job.findFirst({
      where: { id: jobId, proId: pro.id },
      include: jobDetailInclude,
    });
    if (!current) throw notFound('This job is not assigned to you.');
    if (current.status !== JobStatus.ARRIVED) {
      throw conflict(`This job cannot be started from its current state (${current.status}).`);
    }
    if (!current.verificationOtp) {
      throw badRequest('No verification code has been issued yet. Swipe Start Work first.');
    }
    if (!safeEqual(current.verificationOtp, code)) {
      if (startOtpGuard) await startOtpGuard.recordFailure(identifier);
      await prisma.job.update({
        where: { id: current.id },
        data: { startOtpAttempts: { increment: 1 } },
      });
      throw badRequest(
        'That verification code is not correct. Check with the customer and try again.',
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.job.findFirst({
        where: { id: jobId, proId: pro.id },
        include: jobDetailInclude,
      });
      if (!row) throw notFound('This job is not assigned to you.');
      if (row.status !== JobStatus.ARRIVED || !row.verificationOtp) {
        throw conflict('This job is no longer waiting to be verified.');
      }
      await tx.jobStatusHistory.create({
        data: {
          jobId: row.id,
          fromStatus: row.status,
          toStatus: JobStatus.IN_PROGRESS,
          changedById: proUserId,
        },
      });
      const next = await tx.job.update({
        where: { id: row.id },
        data: { status: JobStatus.IN_PROGRESS, verificationOtp: null, startOtpAttempts: 0 },
        include: jobDetailInclude,
      });
      return next;
    });

    if (startOtpGuard) await startOtpGuard.reset(identifier);

    const proDetail = toJobDetail(updated as unknown as JobDetailRow, 'pro', storage, config);
    const customerDetail = toJobDetail(
      updated as unknown as JobDetailRow,
      'customer',
      storage,
      config,
    );
    realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_STATUS, proDetail);
    realtime.emitToUser(updated.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);

    const proName = updated.pro?.displayName ?? 'Your professional';
    const serviceName = updated.service.name;
    notifyCustomer(notifications, {
      customerId: updated.customerId,
      customerUserId: updated.customer.userId,
      jobId: updated.id,
      kind: NotificationKind.JOB_STATUS,
      title: 'Work started',
      body: `${proName} · ${serviceName}`,
      route: `/booking/${updated.id}`,
    });
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
      .filter(
        ({ job, km }) =>
          job.latitude !== null && job.longitude !== null && km <= pro.serviceRadiusKm,
      )
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
        ...toJobDto(job as unknown as JobRow, storage, config),
        distanceKm: km,
        estimatedEtaMinutes: etaMinutes(km),
      };

      realtime.emitToUser(proUserId, REALTIME_EVENTS.JOB_NEW, payload);
      void notifications.alertEligiblePros([{ proId: pro.id, distanceKm: km }], {
        jobId: job.id,
        serviceName: job.service.name,
        serviceCategory: job.customSkill?.trim() || job.skill.name,
        customSkill: job.customSkill,
        description: job.description,
        basePayPaise: job.basePayPaise,
        address: job.locationLabel,
        expiresAt: new Date(job.createdAt.getTime() + config.jobExpireTtlMs).toISOString(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Auto-expiry sweep
  // -------------------------------------------------------------------------

  let expireTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * One auto-expiry sweep: flip every REQUESTED job older than
   * `config.jobExpireTtlMs` to EXPIRED, record the transition, resolve its
   * alerts and page the counterparties so open overlays close immediately.
   *
   * Each row is guarded by an `updateMany` on the exact `{ REQUESTED, proId:
   * null }` state, so a racing acceptance/cancel wins and the job is never
   * expired underneath someone who just claimed it. Returns how many jobs were
   * scanned in this sweep (expired or not), for tests and observability.
   */
  async function expireStaleJobs(): Promise<number> {
    const cutoff = new Date(Date.now() - config.jobExpireTtlMs);
    const stale = await prisma.job.findMany({
      where: { status: JobStatus.REQUESTED, createdAt: { lt: cutoff } },
      select: {
        id: true,
        customerId: true,
        customer: { select: { userId: true } },
        service: { select: { name: true } },
      },
      take: 500,
    });

    for (const row of stale) {
      const expired = await prisma.$transaction(async (tx) => {
        const claimed = await tx.job.updateMany({
          where: { id: row.id, status: JobStatus.REQUESTED, proId: null },
          data: { status: JobStatus.EXPIRED, expiresAt: new Date() },
        });
        if (claimed.count !== 1) return null;

        await tx.jobStatusHistory.create({
          data: { jobId: row.id, fromStatus: JobStatus.REQUESTED, toStatus: JobStatus.EXPIRED },
        });

        return tx.job.findFirstOrThrow({ where: { id: row.id }, include: jobDetailInclude });
      });

      // A racing acceptance or cancellation claimed the job first; nothing to do.
      if (!expired) continue;

      // The customer hears that no one picked up their request in time.
      notifyCustomer(notifications, {
        customerId: row.customerId,
        customerUserId: row.customer.userId,
        jobId: row.id,
        kind: NotificationKind.JOB_STATUS,
        title: 'Request expired',
        body: `${row.service.name} · no professional accepted it in time. Place it again to rematch.`,
        route: `/booking/${row.id}`,
      });

      // The job is no longer open; stop the repeating alert still paging pros and
      // page them with an expired terminal push so open overlays close.
      void notifications.resolveJobAlerts(row.id, 'EXPIRED');

      // Customer and every alerted pro should drop the dead request the instant
      // it expires, not wait for the next validation poll.
      const customerDetail = toJobDetail(
        expired as unknown as JobDetailRow,
        'customer',
        storage,
        config,
      );
      realtime.emitToUser(row.customer.userId, REALTIME_EVENTS.JOB_STATUS, customerDetail);

      const alerted = await prisma.notification.findMany({
        where: { jobId: row.id, kind: NotificationKind.JOB_ALERT },
        select: { pro: { select: { userId: true } } },
      });
      if (alerted.length > 0) {
        const proDetail = toJobDetail(expired as unknown as JobDetailRow, 'pro', storage, config);
        realtime.emitToUsers(
          alerted.map((n) => n.pro.userId),
          REALTIME_EVENTS.JOB_STATUS,
          proDetail,
        );
      }
    }

    return stale.length;
  }

  /** Starts the periodic auto-expiry sweep. Safe to call once. */
  function startExpireSweep(): void {
    if (expireTimer) return;
    expireTimer = setInterval(() => {
      void expireStaleJobs().catch((error: unknown) => {
        logger.error('Job auto-expiry sweep failed.', error);
      });
    }, config.jobExpireSweepMs);
    // Ensure the interval does not keep the process alive on shutdown.
    expireTimer.unref?.();
  }

  /** Stops the periodic auto-expiry sweep. */
  function stopExpireSweep(): void {
    if (expireTimer) {
      clearInterval(expireTimer);
      expireTimer = null;
    }
  }

  return {
    createForCustomer,
    listForCustomer,
    getForCustomer,
    collectCashForPro,
    cancelJob,
    listProJobs,
    listAvailableJobs,
    getAvailableJobForPro,
    declineJob,
    listJobHistory,
    notifyReadyJobRequests,
    acceptJob,
    acceptJobWithOffer,
    rejectJobOffer,
    transitionJob,
    verifyStart,
    expireStaleJobs,
    startExpireSweep,
    stopExpireSweep,
  };
}

export type JobsService = ReturnType<typeof createJobsService>;
