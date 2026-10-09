import { AccountDeletionStatus, JobStatus } from '@samona/types';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { LegalHoldService } from './legal-holds.service';
import type { OrphanScanReport, RetentionCategory, RetentionItemRef } from './types';

/**
 * Job statuses that mean work is still live. A record tied to one of these is
 * never aged out, because the customer and pro may still act on it.
 */
const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default number of non-PII sample refs a category report carries. */
export const DEFAULT_SAMPLE_LIMIT = 25;

/**
 * Upper bound on rows/objects one handler will walk in a single sweep, so a
 * pathological backlog cannot pin the process. A truncated run is reported as
 * such and the remainder is picked up by the next sweep.
 */
export const DEFAULT_MAX_SCAN = 10_000;

export interface HandlerArgs {
  cutoff: Date;
  dryRun: boolean;
  /** True only when the policy would permit an actual destructive delete. */
  canDelete: boolean;
  sampleLimit: number;
  maxScan: number;
}

export interface HandlerResult {
  eligibleCount: number;
  skippedLegalHold: number;
  skippedActiveJob: number;
  deletedCount: number;
  sample: RetentionItemRef[];
  truncated: boolean;
  orphan?: OrphanScanReport;
}

export type RetentionHandler = (args: HandlerArgs) => Promise<HandlerResult>;

/** Scans a bucket for objects no database row references any more. */
export interface OrphanScanner {
  scanJobImages(args: {
    cutoffMs: number;
    dryRun: boolean;
    sampleLimit: number;
    maxScan: number;
  }): Promise<OrphanScanReport>;
}

export interface RetentionHandlersDeps {
  prisma: PrismaClient;
  storage: StorageService;
  legalHolds: LegalHoldService;
  orphan: OrphanScanner;
  safetyWindowDays: number;
  now?: () => Date;
}

function emptyResult(): HandlerResult {
  return {
    eligibleCount: 0,
    skippedLegalHold: 0,
    skippedActiveJob: 0,
    deletedCount: 0,
    sample: [],
    truncated: false,
  };
}

/**
 * Per-category retention handlers.
 *
 * Two invariants run through every handler:
 *
 * 1. **Report-only is absolute.** A handler never deletes for a report-only
 *    category; the caller also withholds `canDelete`, so there are two
 *    independent guards (CLAUDE.md "never let a control fail open").
 * 2. **Storage before reference.** For a file whose only durable reference is a
 *    database row, the object is deleted first and the row second. A failed
 *    object delete throws, so the row — and therefore the only way to find the
 *    object again — survives to the next sweep.
 */
export function createRetentionHandlers(deps: RetentionHandlersDeps) {
  const safetyWindowMs = deps.safetyWindowDays * DAY_MS;
  const now = (): Date => deps.now?.() ?? new Date();

  /** Profile-level holds (PROFILE / PRO_PROFILE), keyed by Profile id. */
  const heldProfileIds = () => deps.legalHolds.listActiveHolderIds(['PROFILE', 'PRO_PROFILE']);

  /** Document-level holds (DOCUMENT), keyed by ProDocument id. */
  const heldDocumentIds = () => deps.legalHolds.listActiveHolderIds('DOCUMENT');

  /** The profile ids holding any pro-owned rows out of a sweep. */
  const activeHoldProfileFilter = (held: readonly string[]) => ({ userId: { notIn: [...held] } });

  function categoryHandlers(): Record<RetentionCategory, RetentionHandler> {
    return {
      /* ------------------------------- Pro docs ------------------------------ */
      proDocuments: async (args) => {
        const heldProfiles = await heldProfileIds();
        const heldDocs = await heldDocumentIds();
        // Retention clock is account *deletion*, not document age: a pro deleted
        // after the cutoff keeps their documents. Anchoring on `createdAt` would
        // purge an old document the moment an account closed, which is exactly
        // when a fraud/dispute window needs it. Matches proServicesSkills.
        const proWindow: Prisma.ProProfileWhereInput = {
          deletedAt: { not: null, lt: args.cutoff },
        };
        const base: Prisma.ProDocumentWhereInput = { proProfile: proWindow };

        const total = await deps.prisma.proDocument.count({ where: base });
        const heldCount = await deps.prisma.proDocument.count({
          where: {
            ...base,
            OR: [
              { id: { in: heldDocs } },
              { proProfile: { ...proWindow, userId: { in: heldProfiles } } },
            ],
          },
        });
        const eligibleWhere: Prisma.ProDocumentWhereInput = {
          ...base,
          id: { notIn: heldDocs },
          proProfile: { ...proWindow, ...activeHoldProfileFilter(heldProfiles) },
        };
        const eligibleCount = total - heldCount;

        const docs = await deps.prisma.proDocument.findMany({
          where: eligibleWhere,
          orderBy: { createdAt: 'asc' },
          take: Math.min(args.sampleLimit, args.maxScan),
          select: { id: true, storagePath: true, createdAt: true },
        });
        const sample = docs.map((doc) => ({
          id: doc.id,
          createdAt: doc.createdAt.toISOString(),
        }));

        let deletedCount = 0;
        if (args.canDelete) {
          const batch = await deps.prisma.proDocument.findMany({
            where: eligibleWhere,
            orderBy: { createdAt: 'asc' },
            take: args.maxScan,
            select: { id: true, storagePath: true },
          });
          for (const doc of batch) {
            // Storage first: if this throws, the row is left in place and the
            // category is retried, so the object is never leaked un-referenced.
            await deps.storage.deleteObject(deps.storage.documentsBucket, doc.storagePath);
          }
          const removed = await deps.prisma.proDocument.deleteMany({
            where: { id: { in: batch.map((doc) => doc.id) } },
          });
          deletedCount = removed.count;
        }

        return {
          eligibleCount,
          skippedLegalHold: heldCount,
          skippedActiveJob: 0,
          deletedCount,
          sample,
          truncated: eligibleCount > docs.length,
        };
      },

      /* -------------------------------- Selfies ------------------------------ */
      selfies: async (args) => {
        const heldProfiles = await heldProfileIds();
        // Clock is account deletion (see proDocuments): a selfie is retained for
        // the approved window after the profile is tombstoned, not until the
        // capture date ages out.
        const base: Prisma.ProProfileWhereInput = {
          deletedAt: { not: null, lt: args.cutoff },
          selfiePhotoPath: { not: null },
        };
        const eligibleWhere: Prisma.ProProfileWhereInput = {
          ...base,
          userId: { notIn: heldProfiles },
        };

        const total = await deps.prisma.proProfile.count({ where: base });
        const heldCount = await deps.prisma.proProfile.count({
          where: { ...base, userId: { in: heldProfiles } },
        });
        const eligibleCount = total - heldCount;

        const rows = await deps.prisma.proProfile.findMany({
          where: eligibleWhere,
          orderBy: { selfieCapturedAt: 'asc' },
          take: Math.min(args.sampleLimit, args.maxScan),
          select: { id: true, userId: true, selfiePhotoPath: true, selfieCapturedAt: true },
        });
        const sample = rows.map((row) => ({
          id: row.id,
          createdAt: row.selfieCapturedAt?.toISOString() ?? null,
          key: row.selfiePhotoPath,
        }));

        let deletedCount = 0;
        if (args.canDelete) {
          const batch = await deps.prisma.proProfile.findMany({
            where: eligibleWhere,
            orderBy: { selfieCapturedAt: 'asc' },
            take: args.maxScan,
            select: { id: true, selfiePhotoPath: true },
          });
          for (const row of batch) {
            if (!row.selfiePhotoPath) continue;
            await deps.storage.deleteObject(deps.storage.selfiesBucket, row.selfiePhotoPath);
            await deps.prisma.proProfile.update({
              where: { id: row.id },
              data: { selfiePhotoPath: null, selfieCapturedAt: null },
            });
            deletedCount += 1;
          }
        }

        return {
          eligibleCount,
          skippedLegalHold: heldCount,
          skippedActiveJob: 0,
          deletedCount,
          sample,
          truncated: eligibleCount > rows.length,
        };
      },

      /* ------------------------------ Pro avatars ---------------------------- */
      avatarsPro: async (args) => {
        // Pro avatars have no database column today (only CustomerProfile
        // does), so the only safe rule is to remove objects belonging to a
        // tombstoned pro. An active pro's object is left alone.
        const heldProfiles = new Set(await heldProfileIds());
        const prefix = 'pros/';
        const cutoffMs = now().getTime() - safetyWindowMs;

        const scanned: Array<{ key: string; userId: string; lastModified: Date | null }> = [];
        let token: string | null = null;
        let truncated = false;
        do {
          const page = await deps.storage.listObjects(deps.storage.avatarsBucket, prefix, {
            continuationToken: token ?? undefined,
          });
          for (const object of page.objects) {
            const userId = object.key.split('/')[1];
            if (userId)
              scanned.push({ key: object.key, userId, lastModified: object.lastModified });
          }
          token = page.nextToken;
          if (scanned.length >= args.maxScan) {
            truncated = token !== null;
            break;
          }
        } while (token);

        const userIds = [...new Set(scanned.map((object) => object.userId))];
        const tombstoned = new Set(
          (
            await deps.prisma.proProfile.findMany({
              where: { userId: { in: userIds }, deletedAt: { not: null } },
              select: { userId: true },
            })
          ).map((row) => row.userId),
        );

        const eligible = scanned.filter(
          (object) =>
            tombstoned.has(object.userId) &&
            !heldProfiles.has(object.userId) &&
            object.lastModified !== null &&
            object.lastModified.getTime() < cutoffMs,
        );
        const heldCount = scanned.filter(
          (object) => tombstoned.has(object.userId) && heldProfiles.has(object.userId),
        ).length;

        let deletedCount = 0;
        if (args.canDelete && eligible.length > 0) {
          await deps.storage.deleteObjects(
            deps.storage.avatarsBucket,
            eligible.map((object) => object.key),
          );
          deletedCount = eligible.length;
        }

        return {
          eligibleCount: eligible.length,
          skippedLegalHold: heldCount,
          skippedActiveJob: 0,
          deletedCount,
          sample: eligible.slice(0, args.sampleLimit).map((object) => ({
            id: object.key,
            key: object.key,
          })),
          truncated,
        };
      },

      /* ------------------------------ Job images ----------------------------- */
      jobImages: async (args) => {
        const orphan = await deps.orphan.scanJobImages({
          cutoffMs: now().getTime() - safetyWindowMs,
          dryRun: args.dryRun || !args.canDelete,
          sampleLimit: args.sampleLimit,
          maxScan: args.maxScan,
        });
        return {
          eligibleCount: orphan.orphanCount,
          skippedLegalHold: 0,
          skippedActiveJob: 0,
          deletedCount: orphan.deletedCount,
          sample: orphan.sampleKeys.map((key) => ({ id: key, key })),
          truncated: orphan.scannedCount >= args.maxScan,
          orphan,
        };
      },

      /* --------------------------- Pro notifications ------------------------- */
      notificationsPro: async (args) => {
        const held = await heldProfileIds();
        const base: Prisma.NotificationWhereInput = {
          createdAt: { lt: args.cutoff },
          OR: [{ jobId: null }, { job: { status: { notIn: [...ACTIVE_JOB_STATUSES] } } }],
        };
        const eligibleWhere: Prisma.NotificationWhereInput = {
          ...base,
          pro: activeHoldProfileFilter(held),
        };

        const total = await deps.prisma.notification.count({ where: base });
        const heldCount = await deps.prisma.notification.count({
          where: { ...base, pro: { userId: { in: held } } },
        });
        const skippedActiveJob = await deps.prisma.notification.count({
          where: {
            createdAt: { lt: args.cutoff },
            job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
          },
        });
        const eligibleCount = total - heldCount;

        const rows = await deps.prisma.notification.findMany({
          where: eligibleWhere,
          orderBy: { createdAt: 'asc' },
          take: args.sampleLimit,
          select: { id: true, createdAt: true },
        });

        let deletedCount = 0;
        if (args.canDelete) {
          const removed = await deps.prisma.notification.deleteMany({ where: eligibleWhere });
          deletedCount = removed.count;
        }

        return {
          eligibleCount,
          skippedLegalHold: heldCount,
          skippedActiveJob,
          deletedCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
          truncated: eligibleCount > rows.length,
        };
      },

      /* ------------------------ Customer notifications ----------------------- */
      customerNotifications: async (args) => {
        const base: Prisma.CustomerNotificationWhereInput = {
          createdAt: { lt: args.cutoff },
          OR: [{ jobId: null }, { job: { status: { notIn: [...ACTIVE_JOB_STATUSES] } } }],
        };
        const eligibleCount = await deps.prisma.customerNotification.count({ where: base });
        const skippedActiveJob = await deps.prisma.customerNotification.count({
          where: {
            createdAt: { lt: args.cutoff },
            job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
          },
        });
        const rows = await deps.prisma.customerNotification.findMany({
          where: base,
          orderBy: { createdAt: 'asc' },
          take: args.sampleLimit,
          select: { id: true, createdAt: true },
        });

        let deletedCount = 0;
        if (args.canDelete) {
          const removed = await deps.prisma.customerNotification.deleteMany({ where: base });
          deletedCount = removed.count;
        }

        return {
          eligibleCount,
          skippedLegalHold: 0,
          skippedActiveJob,
          deletedCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
          truncated: eligibleCount > rows.length,
        };
      },

      /* --------------------------- Pro services/skills ----------------------- */
      proServicesSkills: async (args) => {
        const held = await heldProfileIds();
        const proWindow: Prisma.ProProfileWhereInput = {
          deletedAt: { not: null, lt: args.cutoff },
        };
        const serviceWhere: Prisma.ProServiceWhereInput = {
          createdAt: { lt: args.cutoff },
          proProfile: { ...proWindow, userId: { notIn: held } },
        };
        const skillWhere: Prisma.ProSkillWhereInput = {
          proProfile: { ...proWindow, userId: { notIn: held } },
        };

        const eligibleCount =
          (await deps.prisma.proService.count({ where: serviceWhere })) +
          (await deps.prisma.proSkill.count({ where: skillWhere }));
        const heldCount =
          (await deps.prisma.proService.count({
            where: {
              ...serviceWhere,
              proProfile: { deletedAt: proWindow.deletedAt, userId: { in: held } },
            },
          })) +
          (await deps.prisma.proSkill.count({
            where: { proProfile: { deletedAt: proWindow.deletedAt, userId: { in: held } } },
          }));

        const services = await deps.prisma.proService.findMany({
          where: serviceWhere,
          take: args.sampleLimit,
          select: { proProfileId: true, serviceId: true, createdAt: true },
        });
        const skills = await deps.prisma.proSkill.findMany({
          where: skillWhere,
          take: args.sampleLimit,
          select: { proProfileId: true, skillId: true },
        });
        const sample: RetentionItemRef[] = [
          ...services.map((row) => ({
            id: `${row.proProfileId}:${row.serviceId}`,
            createdAt: row.createdAt.toISOString(),
          })),
          ...skills.map((row) => ({ id: `${row.proProfileId}:${row.skillId}` })),
        ].slice(0, args.sampleLimit);

        let deletedCount = 0;
        if (args.canDelete) {
          const removedServices = await deps.prisma.proService.deleteMany({ where: serviceWhere });
          const removedSkills = await deps.prisma.proSkill.deleteMany({ where: skillWhere });
          deletedCount = removedServices.count + removedSkills.count;
        }

        return {
          eligibleCount,
          skippedLegalHold: heldCount,
          skippedActiveJob: 0,
          deletedCount,
          sample,
          truncated: false,
        };
      },

      /* --------------------------- Declines and offers ----------------------- */
      jobDeclinesOffers: async (args) => {
        const held = await heldProfileIds();
        const declineWhere: Prisma.JobDeclineWhereInput = {
          createdAt: { lt: args.cutoff },
          job: { status: { notIn: [...ACTIVE_JOB_STATUSES] } },
          pro: activeHoldProfileFilter(held),
        };
        const offerWhere: Prisma.JobOfferWhereInput = {
          createdAt: { lt: args.cutoff },
          job: { status: { notIn: [...ACTIVE_JOB_STATUSES] } },
          OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now() } }],
          pro: activeHoldProfileFilter(held),
        };

        const eligibleCount =
          (await deps.prisma.jobDecline.count({ where: declineWhere })) +
          (await deps.prisma.jobOffer.count({ where: offerWhere }));
        const heldCount =
          (await deps.prisma.jobDecline.count({
            where: { createdAt: { lt: args.cutoff }, pro: { userId: { in: held } } },
          })) +
          (await deps.prisma.jobOffer.count({
            where: { createdAt: { lt: args.cutoff }, pro: { userId: { in: held } } },
          }));
        const skippedActiveJob =
          (await deps.prisma.jobDecline.count({
            where: {
              createdAt: { lt: args.cutoff },
              job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
            },
          })) +
          (await deps.prisma.jobOffer.count({
            where: {
              createdAt: { lt: args.cutoff },
              OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now() } }],
              job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
            },
          }));

        const declines = await deps.prisma.jobDecline.findMany({
          where: declineWhere,
          take: args.sampleLimit,
          select: { id: true, createdAt: true },
        });
        const offers = await deps.prisma.jobOffer.findMany({
          where: offerWhere,
          take: args.sampleLimit,
          select: { id: true, createdAt: true },
        });
        const sample: RetentionItemRef[] = [...declines, ...offers]
          .slice(0, args.sampleLimit)
          .map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() }));

        let deletedCount = 0;
        if (args.canDelete) {
          const removedDeclines = await deps.prisma.jobDecline.deleteMany({ where: declineWhere });
          const removedOffers = await deps.prisma.jobOffer.deleteMany({ where: offerWhere });
          deletedCount = removedDeclines.count + removedOffers.count;
        }

        return {
          eligibleCount,
          skippedLegalHold: heldCount,
          skippedActiveJob,
          deletedCount,
          sample,
          truncated: false,
        };
      },

      /* --------------------------- Report-only categories -------------------- */
      avatarsCustomer: async (args) => {
        const where: Prisma.CustomerProfileWhereInput = {
          avatarUrl: { not: null },
          updatedAt: { lt: args.cutoff },
        };
        const eligibleCount = await deps.prisma.customerProfile.count({ where });
        const rows = await deps.prisma.customerProfile.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { updatedAt: 'asc' },
          select: { id: true, updatedAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.updatedAt.toISOString() })),
        };
      },

      accountDeletionAudit: async (args) => {
        const where: Prisma.AccountDeletionWhereInput = {
          status: AccountDeletionStatus.COMPLETED,
          updatedAt: { lt: args.cutoff },
        };
        const eligibleCount = await deps.prisma.accountDeletion.count({ where });
        const rows = await deps.prisma.accountDeletion.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { updatedAt: 'asc' },
          select: { id: true, updatedAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.updatedAt.toISOString() })),
        };
      },

      savedAddresses: async (args) => {
        const where: Prisma.SavedAddressWhereInput = { createdAt: { lt: args.cutoff } };
        const eligibleCount = await deps.prisma.savedAddress.count({ where });
        const rows = await deps.prisma.savedAddress.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
        };
      },

      messages: async (args) => {
        const where: Prisma.MessageWhereInput = { sentAt: { lt: args.cutoff } };
        const eligibleCount = await deps.prisma.message.count({ where });
        const rows = await deps.prisma.message.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { sentAt: 'asc' },
          select: { id: true, sentAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.sentAt.toISOString() })),
        };
      },

      jobsCompleted: async (args) => {
        const where: Prisma.JobWhereInput = {
          status: {
            in: [JobStatus.COMPLETED, JobStatus.PAYMENT_PENDING, JobStatus.PAID],
          },
          updatedAt: { lt: args.cutoff },
        };
        const eligibleCount = await deps.prisma.job.count({ where });
        const rows = await deps.prisma.job.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { updatedAt: 'asc' },
          select: { id: true, updatedAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({ id: row.id, createdAt: row.updatedAt.toISOString() })),
        };
      },

      jobsCancelled: async (args) => {
        const where: Prisma.JobWhereInput = {
          status: { in: [JobStatus.CANCELLED, JobStatus.EXPIRED] },
          cancelledAt: { lt: args.cutoff },
        };
        const eligibleCount = await deps.prisma.job.count({ where });
        const rows = await deps.prisma.job.findMany({
          where,
          take: args.sampleLimit,
          orderBy: { cancelledAt: 'asc' },
          select: { id: true, cancelledAt: true },
        });
        return {
          ...emptyResult(),
          eligibleCount,
          sample: rows.map((row) => ({
            id: row.id,
            createdAt: row.cancelledAt?.toISOString() ?? null,
          })),
        };
      },
    };
  }

  return { handlers: categoryHandlers() };
}

export type RetentionHandlers = ReturnType<typeof createRetentionHandlers>;
