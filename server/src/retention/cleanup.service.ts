import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { Redis } from '../database/redis';
import type { RetentionPolicy } from './policy';
import type { LegalHoldService } from './legal-holds.service';
import type { CleanupAuditService } from './cleanup-audit.service';
import type { OrphanService } from './orphan.service';
import type { CategoryReport, SweepReport } from './types';
import { createDistributedLock, type DistributedLock } from './lock';
import {
  createRetentionHandlers,
  DEFAULT_MAX_SCAN,
  DEFAULT_SAMPLE_LIMIT,
  type RetentionHandler,
} from './handlers';
import { logger } from '../common/logger';

export interface RetentionCleanupServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  /** Null in a degraded environment; a destructive sweep then fails closed. */
  redis: Redis | null;
  policy: RetentionPolicy;
  legalHolds: LegalHoldService;
  audit: CleanupAuditService;
  orphan: OrphanService;
  /** Injectable for tests; otherwise built from the policy's lock settings. */
  lock?: DistributedLock;
  handlers?: Record<string, RetentionHandler>;
  sampleLimit?: number;
  maxScan?: number;
  now?: () => Date;
}

function sanitizeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function emptyTotals(): SweepReport['totals'] {
  return { eligible: 0, wouldDelete: 0, deleted: 0, skippedLegalHold: 0, skippedActiveJob: 0 };
}

/**
 * The retention sweep.
 *
 * A **dry-run** is strictly read-only: no database writes, no S3 deletes, no
 * legal-hold changes and — deliberately — no audit rows either, so a preview
 * leaves no trace. It needs no distributed lock (it changes nothing) and can be
 * run in staging while Redis is unreachable.
 *
 * An **actual** sweep is gated three ways before it can delete: the global
 * enable flag, the per-category flag plus an approved period, and a Redis lock.
 * If the lock cannot be acquired the sweep is skipped entirely rather than run
 * unlocked.
 */
export function createRetentionCleanupService(deps: RetentionCleanupServiceDeps) {
  const now = (): Date => deps.now?.() ?? new Date();
  const sampleLimit = deps.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
  const maxScan = deps.maxScan ?? DEFAULT_MAX_SCAN;

  const lock =
    deps.lock ??
    createDistributedLock({
      redis: deps.redis,
      lockKey: 'retention:cleanup:lock',
      ttlMs: deps.policy.flags.lockTtlMs,
      retryMs: deps.policy.flags.lockRetryMs,
    });

  const handlers =
    deps.handlers ??
    createRetentionHandlers({
      prisma: deps.prisma,
      storage: deps.storage,
      legalHolds: deps.legalHolds,
      orphan: deps.orphan,
      safetyWindowDays: deps.policy.flags.safetyWindowDays,
      now,
    }).handlers;

  async function sweep(dryRun = deps.policy.flags.dryRunDefault): Promise<SweepReport> {
    const mode = dryRun ? 'DRY_RUN' : 'ACTUAL';
    const startedAt = now();

    let token = '';
    let lockLost = false;
    let renewal: { stop: () => void } | null = null;
    if (!dryRun) {
      const attempt = await lock.acquire();
      if (!attempt.acquired) {
        logger.warn('Retention sweep skipped: cleanup lock not acquired (failing closed).');
        return {
          mode,
          skipped: true,
          reason: 'LOCK_UNAVAILABLE',
          startedAt: startedAt.toISOString(),
          finishedAt: now().toISOString(),
          categories: [],
          totals: emptyTotals(),
        };
      }
      token = attempt.token;
      // Keep the lock alive for the duration of the sweep. If the keepalive
      // ever reports the token is no longer ours, stop: a destructive sweep
      // must not continue without holding the lock.
      renewal = lock.startRenewal(token, () => {
        lockLost = true;
        logger.warn('Retention sweep lost the cleanup lock; stopping further destructive work.');
      });
    }

    try {
      logger.info('Retention sweep started', {
        mode,
        safetyWindowDays: deps.policy.flags.safetyWindowDays,
      });

      const categories: CategoryReport[] = [];

      for (const category of deps.policy.categories) {
        const periodDays = deps.policy.getRetentionDays(category) ?? null;
        const enabled = deps.policy.isCategoryEnabled(category);
        const reportOnly = deps.policy.isReportOnly(category);
        const deletable = deps.policy.canDeleteCategory(category);
        const expiration = periodDays === null ? undefined : deps.policy.expirationDate(category);
        const categoryStartedAt = now();

        const report: CategoryReport = {
          category,
          periodDays,
          enabled,
          reportOnly,
          deletable,
          expirationDate: expiration?.toISOString() ?? null,
          eligibleCount: 0,
          wouldDeleteCount: 0,
          deletedCount: 0,
          skippedLegalHold: 0,
          skippedActiveJob: 0,
          sample: [],
          truncated: false,
        };

        // No approved period: nothing ages out, so there is nothing to scan.
        if (expiration === undefined) {
          categories.push(report);
          continue;
        }

        // If the keepalive already reported the lock lost, scan nothing more:
        // the remaining categories are recorded and the sweep stays safe.
        if (lockLost) {
          report.skippedReason = 'LOCK_LOST';
          categories.push(report);
          continue;
        }

        // A destructive delete needs the period, the flag, a non-report-only
        // category, and an actual (non-dry) run.
        const canDelete = deletable && !dryRun;

        try {
          const result = await handlers[category]({
            cutoff: expiration,
            dryRun,
            canDelete,
            sampleLimit,
            maxScan,
          });
          report.eligibleCount = result.eligibleCount;
          report.skippedLegalHold = result.skippedLegalHold;
          report.skippedActiveJob = result.skippedActiveJob;
          report.deletedCount = result.deletedCount;
          report.sample = result.sample;
          report.truncated = result.truncated;
          report.wouldDeleteCount = dryRun ? (deletable ? result.eligibleCount : 0) : 0;
          if (result.orphan) report.orphan = result.orphan;
        } catch (error) {
          report.error = sanitizeMessage(error);
          logger.error(`Retention category ${category} failed.`, error);
        }

        if (!dryRun) {
          await deps.audit.record({
            category,
            action: report.error ? 'CLEANUP_ERROR' : reportOnly ? 'REPORT_ONLY' : 'CLEANUP',
            affectedCount: report.deletedCount,
            executionMode: 'ACTUAL',
            startedAt: categoryStartedAt,
            finishedAt: now(),
            success: report.error === undefined,
            error: report.error ?? null,
            metadata: {
              eligibleCount: report.eligibleCount,
              skippedLegalHold: report.skippedLegalHold,
              skippedActiveJob: report.skippedActiveJob,
              truncated: report.truncated,
            },
          });
        }

        categories.push(report);
      }

      const totals = categories.reduce((acc, category) => {
        acc.eligible += category.eligibleCount;
        acc.wouldDelete += category.wouldDeleteCount;
        acc.deleted += category.deletedCount;
        acc.skippedLegalHold += category.skippedLegalHold;
        acc.skippedActiveJob += category.skippedActiveJob;
        return acc;
      }, emptyTotals());

      logger.info('Retention sweep finished', {
        mode,
        totals,
        durationMs: now().getTime() - startedAt.getTime(),
      });

      return {
        mode,
        skipped: false,
        lockLost: lockLost || undefined,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
        categories,
        totals,
      };
    } finally {
      renewal?.stop();
      // Releasing only succeeds if we still hold the token; if the lock was
      // lost, this is a harmless no-op (compare-and-delete).
      if (!dryRun && token) await lock.release(token);
    }
  }

  return { sweep, lockKey: lock.key };
}

export type RetentionCleanupService = ReturnType<typeof createRetentionCleanupService>;
