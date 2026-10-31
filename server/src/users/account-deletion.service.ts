import { createHash, randomBytes } from 'node:crypto';
import {
  AccountDeletionScope,
  AccountDeletionStatus,
  AccountDeletionStep,
  JobStatus,
  type DeletionAccepted,
  type DeletionAuthorization,
  type DeletionStatus,
} from '@samona/types';
import type { AppConfig } from '../config';
import type { AppType } from '@samona/config';
import type { PrismaClient } from '../database/prisma';
import type { RealtimeService } from '../realtime/gateway';
import type { StorageService } from '../files/storage.service';
import type { AuthMethod } from '../auth/token';
import type { LegalHoldService } from '../retention/legal-holds.service';
import type { CleanupAuditService } from '../retention/cleanup-audit.service';
import { conflict, forbidden, gone, notFound } from '../common/errors';
import { logger } from '../common/logger';

export interface AccountDeletionServiceDeps {
  prisma: PrismaClient;
  config: AppConfig;
  /** Presigned storage access; used to purge the pro's S3 objects on finalize. */
  storage: StorageService;
  /** Kicks the deleting account's sockets off at finalize. */
  realtime: RealtimeService;
  /**
   * Deletes a Supabase Auth identity (FULL_ACCOUNT scope only). Injectable so
   * tests drive the workflow without a live Admin API.
   */
  supabaseAdmin?: { deleteUser: (userId: string) => Promise<void> };
  /** Injectable clock for tests. */
  now?: () => Date;
  legalHolds?: LegalHoldService;
  /** Append-only retention audit; records preserved-under-hold events. */
  audit?: CleanupAuditService;
}

/**
 * Job statuses that block finalization until they resolve.
 *
 * Deliberately excludes COMPLETED and PAYMENT_PENDING: those carry a locked,
 * already-delivered outcome (and the financial rows survive regardless), so
 * waiting on them would strand an otherwise-finished deletion. ACCEPTED through
 * IN_PROGRESS are work the pro may still be driving — matching, offers and job
 * claims stop the moment `deletionRequestedAt` is set, but the pro keeps
 * finishing these.
 */
export const ACCOUNT_DELETION_BLOCKING_STATUSES: readonly JobStatus[] = [
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
];

const DELETION_STEPS: readonly AccountDeletionStep[] = [
  AccountDeletionStep.LOCK,
  AccountDeletionStep.PURGE_S3,
  AccountDeletionStep.PURGE_DB,
  AccountDeletionStep.DELETE_AUTH,
  AccountDeletionStep.FINALIZE,
];

/** The subset of an `AccountDeletion` row a step needs. */
interface DeletionRow {
  profileId: string;
  scope: AccountDeletionScope;
  step: AccountDeletionStep | null;
  attempts: number;
  customerProfileId: string | null;
}

/** The legal-hold decision as it stood when the snapshot was taken. */
interface HoldSnapshot {
  profileHeld: boolean;
  heldDocumentPaths: string[];
}

/** SHA-256 of a deletion authorization; the only token identity ever stored. */
function hashDeletionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAccountDeletionService(deps: AccountDeletionServiceDeps) {
  const { prisma, config } = deps;
  const now = (): Date => deps.now?.() ?? new Date();

  // The single process may green one tick into another if a sweep runs long.
  // The set of profile ids currently mid-finalize stops two ticks from racing
  // the same row's steps.
  const inFlight = new Set<string>();

  /**
   * Deletes every object under `prefix` except those in `keep`.
   *
   * Unlike `removeObjectPrefix`, this leaves a named set in place — the objects
   * a legal hold protects. It lists first and deletes second so a key cannot be
   * skipped by deleting the page it is on, and it *throws* on a partial failure
   * so the deletion step is retried rather than recorded as done.
   */
  async function purgePrefixExcept(
    bucket: string,
    prefix: string,
    keep: ReadonlySet<string>,
  ): Promise<void> {
    const toDelete: string[] = [];
    let token: string | undefined;
    do {
      const page = await deps.storage.listObjects(bucket, prefix, { continuationToken: token });
      for (const object of page.objects) {
        if (!keep.has(object.key)) toDelete.push(object.key);
      }
      token = page.nextToken ?? undefined;
    } while (token);
    if (toDelete.length > 0) await deps.storage.deleteObjects(bucket, toDelete);
  }

  /** The storage paths of this pro's documents that an active hold protects. */
  async function heldDocumentPaths(proProfileId: string): Promise<Set<string>> {
    if (!deps.legalHolds) return new Set();
    const heldDocIds = new Set(await deps.legalHolds.listActiveHolderIds('DOCUMENT'));
    if (heldDocIds.size === 0) return new Set();
    const docs = await prisma.proDocument.findMany({
      where: { proProfileId },
      select: { id: true, storagePath: true },
    });
    return new Set(docs.filter((doc) => heldDocIds.has(doc.id)).map((doc) => doc.storagePath));
  }

  /** Resolves the live hold decision from the hold registry right now. */
  async function resolveHoldSnapshot(profileId: string): Promise<HoldSnapshot> {
    const profileHeld = deps.legalHolds
      ? await deps.legalHolds.hasAnyActiveHoldForProfile(profileId)
      : false;
    if (profileHeld || !deps.legalHolds) return { profileHeld, heldDocumentPaths: [] };

    const pro = await prisma.proProfile.findUnique({
      where: { userId: profileId },
      select: { id: true },
    });
    const paths = pro ? [...(await heldDocumentPaths(pro.id))] : [];
    return { profileHeld, heldDocumentPaths: paths };
  }

  /**
   * The frozen hold decision for this deletion, captured exactly once.
   *
   * PURGE_S3 captures it before deleting anything; PURGE_DB reads the same
   * value instead of re-resolving. A hold created between the two steps can no
   * longer make one step preserve what the other destroyed, and every retry
   * sees one decision rather than a moving target.
   */
  async function ensureHoldSnapshot(profileId: string): Promise<HoldSnapshot> {
    const row = await prisma.accountDeletion.findUnique({
      where: { profileId },
      select: { holdsCapturedAt: true, profileHeld: true, heldDocumentPaths: true },
    });
    if (row?.holdsCapturedAt) {
      return { profileHeld: row.profileHeld, heldDocumentPaths: row.heldDocumentPaths };
    }
    const snapshot = await resolveHoldSnapshot(profileId);
    await prisma.accountDeletion.update({
      where: { profileId },
      data: { ...snapshot, holdsCapturedAt: now() },
    });
    return snapshot;
  }

  function loadAccount(profileId: string) {
    return prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        deletedAt: true,
        proProfile: {
          select: { id: true, deletedAt: true, deletionRequestedAt: true },
        },
        customerProfile: { select: { id: true, deletedAt: true, deletionRequestedAt: true } },
        accountDeletion: true,
      },
    });
  }

  /**
   * The latest OTP authentication timestamp in the verified token's `amr`
   * claim, or null when the session never authenticated with an OTP.
   */
  function latestOtpAt(amr: AuthMethod[]): number | null {
    let latest = -1;
    for (const entry of amr) {
      if (entry.method === 'otp' && entry.timestamp > latest) latest = entry.timestamp;
    }
    return latest < 0 ? null : latest;
  }

  /**
   * The surface the deletion is being driven from.
   *
   * A null `appType` (an admin without a surface header) defaults to the pro
   * surface, preserving the behaviour that predates customer deletion.
   */
  function surfaceForAppType(appType: AppType | null): 'pro' | 'customer' {
    return appType === 'customer' ? 'customer' : 'pro';
  }

  /** Whether a surface profile exists and has not already been tombstoned. */
  function isLive(profile: { deletedAt: Date | null } | null): boolean {
    return profile !== null && profile.deletedAt === null;
  }

  /**
   * The scope the server will apply for this caller.
   *
   * Deleting the surface you are on removes only that surface when the *other*
   * surface still has a live profile; otherwise it is the whole identity. The
   * client never chooses this — it is derived from the account shape and the
   * surface the request arrived on.
   */
  function scopeFor(
    account: {
      proProfile: { deletedAt: Date | null } | null;
      customerProfile: { deletedAt: Date | null } | null;
    },
    appType: AppType | null,
  ): AccountDeletionScope {
    if (surfaceForAppType(appType) === 'customer') {
      return isLive(account.proProfile)
        ? AccountDeletionScope.CUSTOMER_PROFILE
        : AccountDeletionScope.FULL_ACCOUNT;
    }
    return isLive(account.customerProfile)
      ? AccountDeletionScope.PRO_PROFILE
      : AccountDeletionScope.FULL_ACCOUNT;
  }

  /**
   * How many jobs would block finalization for the given scope. Threshold:
   * completion first, so an account whose last job just completed can delete
   * without waiting a sweep. A FULL_ACCOUNT from the customer surface has no
   * live pro, so it blocks on the customer's jobs; one from the pro surface
   * blocks on the pro's.
   */
  async function blockingJobCount(
    account: {
      proProfile: { id: string; deletedAt: Date | null } | null;
      customerProfile: { id: string; deletedAt: Date | null } | null;
    },
    scope: AccountDeletionScope,
  ): Promise<number> {
    const statuses = { in: [...ACCOUNT_DELETION_BLOCKING_STATUSES] };
    if (scope === AccountDeletionScope.PRO_PROFILE && account.proProfile) {
      return prisma.job.count({ where: { proId: account.proProfile.id, status: statuses } });
    }
    if (scope === AccountDeletionScope.CUSTOMER_PROFILE && account.customerProfile) {
      return prisma.job.count({
        where: { customerId: account.customerProfile.id, status: statuses },
      });
    }
    // FULL_ACCOUNT: neither surface may have live work when the identity goes.
    const ids: { proId?: string; customerId?: string }[] = [];
    if (account.proProfile) ids.push({ proId: account.proProfile.id });
    if (account.customerProfile) ids.push({ customerId: account.customerProfile.id });
    if (ids.length === 0) return 0;
    return prisma.job.count({ where: { OR: ids, status: statuses } });
  }

  /**
   * What `GET /users/me/deletion-status` answers: whether the caller can
   * delete, what deletion removes, and whether finalization is deferred.
   */
  async function getDeletionStatus(
    profileId: string,
    appType: AppType | null,
  ): Promise<DeletionStatus> {
    const account = await loadAccount(profileId);
    if (!account) throw notFound();

    const scope = scopeFor(account, appType);
    const surfaceProfile =
      surfaceForAppType(appType) === 'customer' ? account.customerProfile : account.proProfile;
    const deletion = account.accountDeletion;

    const deleted = account.deletedAt !== null || (surfaceProfile?.deletedAt ?? null) !== null;
    const pending =
      deletion?.status === AccountDeletionStatus.AUTHORIZED &&
      deletion.authTokenConsumedAt === null &&
      deletion.authTokenExpiresAt !== null &&
      deletion.authTokenExpiresAt > now();
    const running =
      deletion?.status === AccountDeletionStatus.AWAITING_ACTIVE_JOBS ||
      deletion?.status === AccountDeletionStatus.IN_PROGRESS;

    return {
      scope,
      hasCustomerProfile: account.customerProfile !== null,
      hasProProfile: account.proProfile !== null,
      canAuthorize:
        !deleted && !running && !pending && deletion?.status !== AccountDeletionStatus.FAILED,
      hasPendingAuthorization: pending,
      authorizationExpiresAt:
        pending && deletion?.authTokenExpiresAt ? deletion.authTokenExpiresAt.toISOString() : null,
      inProgress: running,
      // A FAILED deletion is a terminal state that automated retries have given
      // up on; the surface should send the user to support, not a retry.
      failed: deletion?.status === AccountDeletionStatus.FAILED,
      deleted,
      activeJobCount: await blockingJobCount(account, scope),
    };
  }

  /**
   * Mints a single-use deletion authorization, issued only after the access
   * token's `amr` claim proves a fresh OTP within the configured window.
   *
   * The raw token is returned exactly once; the server stores only its SHA-256.
   */
  async function issueAuthorization(
    profileId: string,
    amr: AuthMethod[],
    appType: AppType | null,
  ): Promise<DeletionAuthorization> {
    const otpAt = latestOtpAt(amr);
    const fresh =
      otpAt !== null && now().getTime() - otpAt * 1000 <= config.accountDeletionReauthWindowMs;
    if (!fresh) {
      throw forbidden(
        'Please re-verify your phone to continue. Sign in again with a verification code and retry.',
      );
    }

    const account = await loadAccount(profileId);
    if (!account) throw notFound();
    const surfaceProfile =
      surfaceForAppType(appType) === 'customer' ? account.customerProfile : account.proProfile;
    if (account.deletedAt !== null || (surfaceProfile?.deletedAt ?? null) !== null) {
      throw gone('This account has already been deleted.');
    }

    const scope = scopeFor(account, appType);
    const existing = account.accountDeletion;
    if (existing) {
      const pending =
        existing.status === AccountDeletionStatus.AUTHORIZED &&
        existing.authTokenConsumedAt === null &&
        existing.authTokenExpiresAt !== null &&
        existing.authTokenExpiresAt > now();
      if (pending) {
        throw conflict('You already have a deletion request pending. Confirm it to continue.');
      }
      if (
        existing.status === AccountDeletionStatus.AWAITING_ACTIVE_JOBS ||
        existing.status === AccountDeletionStatus.IN_PROGRESS
      ) {
        throw conflict('Your deletion request is already being processed.');
      }
      if (existing.status === AccountDeletionStatus.FAILED) {
        throw conflict(
          'Your previous deletion attempt failed. Please contact support to complete it.',
        );
      }
      // A COMPLETED row for a surface whose tombstone is gone means the account
      // came back through a fresh re-registration (the finished CUSTOMER_PROFILE
      // tombstone was unlinked and a new live profile now exists). That surface
      // is deletable again, so the row is re-issued below rather than treated as
      // already-deleted. A genuinely tombstoned surface never reaches here: it
      // is caught by the tombstone guard above. A COMPLETED row for the *other*
      // surface is the dual-role sequential case: the row is re-issued (reset)
      // for the surface being deleted now.
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now().getTime() + config.accountDeletionTokenTtlMs);

    const data = {
      scope,
      status: AccountDeletionStatus.AUTHORIZED,
      step: null,
      attempts: 0,
      lastError: null,
      authTokenHash: hashDeletionToken(token),
      authTokenExpiresAt: expiresAt,
      authTokenConsumedAt: null,
      // A re-issued row starts a brand-new deletion: the previous run's frozen
      // hold decision must not carry over to this scope, and the previous run's
      // customer-surface target (if any) does not describe this one.
      holdsCapturedAt: null,
      profileHeld: false,
      heldDocumentPaths: [],
      customerProfileId: null,
    };

    if (existing) {
      await prisma.accountDeletion.update({ where: { profileId }, data });
    } else {
      await prisma.accountDeletion.create({ data: { profileId, ...data } });
    }

    return { token, expiresAt: expiresAt.toISOString(), scope };
  }

  /**
   * Consumes a deletion authorization and accepts the deletion.
   *
   * Consumption is atomic (one row: unused, unexpired, matching hash) so a
   * replay of the token cannot act twice — a second attempt touches zero rows
   * and is reported as 410. The pro is locked out of new bookings immediately
   * (`deletionRequestedAt` set, `isOnline` false); finalization runs now when
   * no blocking jobs remain, otherwise it waits in AWAITING_ACTIVE_JOBS for the
   * sweeper.
   */
  async function deleteAccount(
    profileId: string,
    token: string,
    appType: AppType | null,
  ): Promise<DeletionAccepted> {
    if (token.length === 0 || token.length > 128) throw gone('That deletion code is not valid.');

    const hash = hashDeletionToken(token);
    const at = now();

    const consumed = await prisma.accountDeletion.updateMany({
      where: {
        profileId,
        status: AccountDeletionStatus.AUTHORIZED,
        authTokenHash: hash,
        authTokenConsumedAt: null,
        authTokenExpiresAt: { gt: at },
      },
      data: { authTokenConsumedAt: at },
    });
    if (consumed.count !== 1) throw gone('That deletion code has expired or was already used.');

    const account = await loadAccount(profileId);
    if (!account) throw notFound();

    const scope = scopeFor(account, appType);
    const surfaceProfile =
      surfaceForAppType(appType) === 'customer' ? account.customerProfile : account.proProfile;
    if (!surfaceProfile || surfaceProfile.deletedAt) {
      throw conflict('This account has no profile to delete for this surface.');
    }
    if (scope === AccountDeletionScope.FULL_ACCOUNT) {
      if (!account.proProfile && !account.customerProfile) {
        throw conflict('This account has no profile to delete.');
      }
    }

    // Lock the surface out of the marketplace before anything else: new
    // matching/offers/claims now exclude them; keep working only jobs already
    // in flight. Never reverted.
    if (scope !== AccountDeletionScope.CUSTOMER_PROFILE && account.proProfile) {
      await prisma.proProfile.update({
        where: { id: account.proProfile.id },
        data: { deletionRequestedAt: at, isOnline: false },
      });
    }
    if (scope !== AccountDeletionScope.PRO_PROFILE && account.customerProfile) {
      await prisma.customerProfile.update({
        where: { id: account.customerProfile.id },
        data: { deletionRequestedAt: at },
      });
    }

    const blocking = await blockingJobCount(account, scope);

    await prisma.accountDeletion.update({
      where: { profileId },
      data: {
        status:
          blocking > 0
            ? AccountDeletionStatus.AWAITING_ACTIVE_JOBS
            : AccountDeletionStatus.IN_PROGRESS,
        step: null,
        lastError: null,
        // Freeze which customer surface this run deletes, so a retry never
        // targets a profile the same identity re-registered in between. Only
        // runs that touch the customer surface store a target.
        customerProfileId:
          scope === AccountDeletionScope.PRO_PROFILE
            ? null
            : (account.customerProfile?.id ?? null),
      },
    });

    if (blocking > 0) {
      logger.info(
        `Deletion accepted for ${profileId} (scope=${scope}): ${blocking} active job(s) remain, finalization deferred.`,
      );
      return { scope, deferredToActiveJobs: true };
    }

    await finalize(profileId).catch((error: unknown) => {
      logger.error(`Inline deletion finalization failed for ${profileId}.`, error);
    });
    return { scope, deferredToActiveJobs: false };
  }

  /**
   * Runs (or resumes) the idempotent finalization steps for one deletion.
   *
   * Each step finishes before its completion is recorded, so a crash mid-flight
   * resumes from the last *finished* step; the current step itself is safe to
   * replay because every write is a targeted update/delete with null guards.
   */
  async function runSteps(profileId: string): Promise<void> {
    const row = await prisma.accountDeletion.findUnique({ where: { profileId } });
    if (!row || row.status === AccountDeletionStatus.COMPLETED) return;
    if (
      row.status === AccountDeletionStatus.FAILED &&
      row.attempts >= config.accountDeletionMaxAttempts
    ) {
      return;
    }

    // Version the attempt up-front so a concurrently-run `runSteps` (guarded by
    // `inFlight`) and the sweeper cannot both think they own the row.
    const working = await prisma.accountDeletion.update({
      where: { profileId },
      data: {
        status: AccountDeletionStatus.IN_PROGRESS,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    const startAt = working.step ? DELETION_STEPS.indexOf(working.step) + 1 : 0;

    for (let i = startAt; i < DELETION_STEPS.length; i += 1) {
      const step = DELETION_STEPS[i];
      if (!step) break;
      // FULL_ACCOUNT only: deleting the identity is what makes the account
      // unrecoverable, so a surface-only deletion must never reach this step.
      if (
        step === AccountDeletionStep.DELETE_AUTH &&
        working.scope !== AccountDeletionScope.FULL_ACCOUNT
      ) {
        continue;
      }
      try {
        await runStep(step, working);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const exhausted = working.attempts >= config.accountDeletionMaxAttempts;
        await prisma.accountDeletion.update({
          where: { profileId },
          data: {
            lastError: message,
            ...(exhausted ? { status: AccountDeletionStatus.FAILED } : {}),
          },
        });
        logger.error(
          `Account-deletion step ${step} for ${profileId} failed (attempt ${working.attempts}).`,
          error,
        );
        return;
      }
      // Record completion so a crash resumes from here, not from the start.
      await prisma.accountDeletion.update({ where: { profileId }, data: { step } });
    }
  }

  async function runStep(step: AccountDeletionStep, row: DeletionRow) {
    switch (step) {
      case AccountDeletionStep.LOCK: {
        // Idempotent: set `deletionRequestedAt` for the relevant surface(s).
        if (row.scope !== AccountDeletionScope.CUSTOMER_PROFILE) {
          await prisma.proProfile.updateMany({
            where: { userId: row.profileId, deletionRequestedAt: null },
            data: { deletionRequestedAt: now(), isOnline: false },
          });
        }
        if (row.scope !== AccountDeletionScope.PRO_PROFILE) {
          // Target the frozen row where we have one, so a retry after a
          // re-registration never locks the brand-new profile. Legacy rows
          // resolve by identity as before.
          await prisma.customerProfile.updateMany({
            where: row.customerProfileId
              ? { id: row.customerProfileId, deletionRequestedAt: null }
              : { userId: row.profileId, deletionRequestedAt: null },
            data: { deletionRequestedAt: now() },
          });
        }
        break;
      }

      case AccountDeletionStep.PURGE_S3: {
        // A profile-level hold protects every object the profile owns; a
        // document-level hold protects only that document's object. Everything
        // unrelated is still purged, so erasure is not stalled wholesale by one
        // held file. The hold decision is frozen on the row here, before any
        // delete, and PURGE_DB consumes that same frozen value — so a hold
        // created between the two steps cannot make one preserve what the other
        // destroyed.
        const { profileHeld, heldDocumentPaths: keptDocumentPaths } = await ensureHoldSnapshot(
          row.profileId,
        );
        if (profileHeld) {
          logger.warn(
            `Profile-level legal hold: preserving pro-owned objects during deletion (scope=${row.scope}).`,
            {
              profileId: row.profileId,
            },
          );
        } else {
          const prefixPro = `pros/${row.profileId}/`;
          const prefixCustomer = `customers/${row.profileId}/`;
          const keep = new Set(keptDocumentPaths);
          if (row.scope !== AccountDeletionScope.CUSTOMER_PROFILE) {
            await purgePrefixExcept(deps.storage.selfiesBucket, prefixPro, keep);
            await purgePrefixExcept(deps.storage.avatarsBucket, prefixPro, keep);
            await purgePrefixExcept(deps.storage.documentsBucket, prefixPro, keep);
          }
          if (row.scope !== AccountDeletionScope.PRO_PROFILE) {
            // Customer avatar lives under `customers/{userId}/`; job photos
            // (`jobs/{userId}/`) are kept (shared record per retention policy).
            await purgePrefixExcept(deps.storage.avatarsBucket, prefixCustomer, keep);
          }
        }

        if (deps.audit && profileHeld) {
          await deps.audit.record({
            category: 'accountDeletionAudit',
            action: 'HOLD_PRESERVED_S3',
            affectedCount: 0,
            executionMode: 'ACTUAL',
            startedAt: now(),
            finishedAt: now(),
            success: true,
            metadata: { profileId: row.profileId, scope: row.scope, holderType: 'PROFILE' },
          });
        }
        break;
      }

      case AccountDeletionStep.PURGE_DB: {
        // Consume the snapshot PURGE_S3 froze rather than re-resolving holds.
        const { profileHeld, heldDocumentPaths: heldPaths } = await ensureHoldSnapshot(
          row.profileId,
        );

        await prisma.$transaction(async (tx) => {
          const pro = await tx.proProfile.findUnique({
            where: { userId: row.profileId },
            select: { id: true },
          });
          // Resolve by the frozen target when this run stores one — a retry
          // must tombstone the *original* customer surface, never a profile the
          // same identity re-registered in between. Legacy rows resolve by
          // identity as before.
          const customer = row.customerProfileId
            ? await tx.customerProfile.findUnique({
                where: { id: row.customerProfileId },
                select: { id: true },
              })
            : await tx.customerProfile.findUnique({
                where: { userId: row.profileId },
                select: { id: true },
              });

          // Pro surface purge when this deletion touches the pro surface.
          if (pro && row.scope !== AccountDeletionScope.CUSTOMER_PROFILE) {
            await tx.proService.deleteMany({ where: { proProfileId: pro.id } });
            await tx.proSkill.deleteMany({ where: { proProfileId: pro.id } });
            if (!profileHeld) {
              await tx.proDocument.deleteMany({
                where: { proProfileId: pro.id, storagePath: { notIn: heldPaths } },
              });
            }
            await tx.notification.deleteMany({ where: { proId: pro.id } });
            await tx.jobDecline.deleteMany({ where: { proId: pro.id } });
            await tx.jobOffer.deleteMany({ where: { proId: pro.id } });
            await tx.proPushDevice.deleteMany({ where: { proId: pro.id } });

            await tx.proProfile.update({
              where: { id: pro.id },
              data: {
                displayName: null,
                gender: null,
                bio: null,
                experienceLevel: null,
                latitude: null,
                longitude: null,
                locationLabel: null,
                languages: [],
                ...(profileHeld ? {} : { selfiePhotoPath: null, selfieCapturedAt: null }),
                pushToken: null,
                pushPlatform: null,
                pushProvider: null,
                pushDeviceId: null,
                isOnline: false,
                isVerified: false,
                deletedAt: now(),
              },
            });
          }

          // Customer surface purge when this deletion touches the customer surface.
          if (customer && row.scope !== AccountDeletionScope.PRO_PROFILE) {
            await tx.savedAddress.deleteMany({ where: { userId: row.profileId } });
            await tx.customerNotification.deleteMany({ where: { customerId: customer.id } });
            await tx.customerProfile.update({
              where: { id: customer.id },
              data: {
                // Unlink the tombstone so the identity is free to re-register
                // as a fresh customer; the row (and its id) survives so jobs,
                // reviews and chat keep their relationship.
                userId: null,
                displayName: null,
                gender: null,
                avatarUrl: null,
                locationLabel: null,
                latitude: null,
                longitude: null,
                pushToken: null,
                pushPlatform: null,
                pushProvider: null,
                deletedAt: now(),
              },
            });
          }

          if (row.scope === AccountDeletionScope.FULL_ACCOUNT) {
            await tx.profile.update({
              where: { id: row.profileId },
              data: {
                phone: null,
                email: null,
                fullName: null,
                isActive: false,
                deletedAt: now(),
              },
            });
          }
        });
        break;
      }

      case AccountDeletionStep.DELETE_AUTH:
        // FULL_ACCOUNT only (guarded above). Deleting the identity is what
        // makes the account unrecoverable; a missing service key fails the step
        // loudly so it retries or lands in FAILED rather than silently shrinking
        // to a pro-surface tombstone.
        if (!deps.supabaseAdmin) throw new Error('No Supabase admin client is configured.');
        await deps.supabaseAdmin.deleteUser(row.profileId);
        break;

      case AccountDeletionStep.FINALIZE:
        // Drop the account's sockets. FULL_ACCOUNT: every surface; PRO_PROFILE:
        // only the pro app, so a live customer session is untouched.
        deps.realtime.disconnectUser(
          row.profileId,
          row.scope === AccountDeletionScope.FULL_ACCOUNT
            ? undefined
            : row.scope === AccountDeletionScope.PRO_PROFILE
              ? { appType: 'pro' }
              : { appType: 'customer' },
        );
        await prisma.accountDeletion.update({
          where: { profileId: row.profileId },
          data: { status: AccountDeletionStatus.COMPLETED, step: AccountDeletionStep.FINALIZE },
        });
        break;
    }
  }

  /**
   * Enqueues finalization for one row. Re-entrancy-safe: concurrent calls for
   * the same profile id collapse into one run.
   */
  async function finalize(profileId: string): Promise<void> {
    if (inFlight.has(profileId)) return;
    inFlight.add(profileId);
    try {
      await runSteps(profileId);
    } finally {
      inFlight.delete(profileId);
    }
  }

  /** One sweeper tick: advance every deletion with work left to do. */
  async function sweep(): Promise<void> {
    const rows = await prisma.accountDeletion.findMany({
      where: {
        status: {
          in: [
            AccountDeletionStatus.AWAITING_ACTIVE_JOBS,
            AccountDeletionStatus.IN_PROGRESS,
            AccountDeletionStatus.FAILED,
          ],
        },
      },
      select: { profileId: true, status: true, attempts: true },
    });

    for (const row of rows) {
      if (
        row.status === AccountDeletionStatus.FAILED &&
        row.attempts >= config.accountDeletionMaxAttempts
      ) {
        continue;
      }
      if (row.status === AccountDeletionStatus.AWAITING_ACTIVE_JOBS) {
        const account = await loadAccount(row.profileId);
        if (account) {
          const scope = scopeFor(account, null);
          const pending = await blockingJobCount(account, scope);
          if (pending > 0) continue;
        }
      }
      await finalize(row.profileId).catch((error: unknown) => {
        logger.error(`Deletion sweep failed for ${row.profileId}.`, error);
      });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Scheduler (single Fargate task — setInterval is the deployment-safe pick) */
  /* ------------------------------------------------------------------------ */

  let timer: ReturnType<typeof setInterval> | null = null;

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void sweep().catch((error: unknown) => {
        logger.error('Account-deletion sweep tick failed.', error);
      });
    }, config.accountDeletionSweepMs);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    getDeletionStatus,
    issueAuthorization,
    deleteAccount,
    sweep,
    start,
    stop,
  };
}

export type AccountDeletionService = ReturnType<typeof createAccountDeletionService>;
