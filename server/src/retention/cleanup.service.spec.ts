import { createRetentionCleanupService } from './cleanup.service';
import { retentionPolicyFromConfig, type RetentionConfig } from './policy';
import { RETENTION_CATEGORIES, type RetentionCategory } from './types';
import type { HandlerArgs, HandlerResult, RetentionHandler } from './handlers';
import type { LegalHoldService } from './legal-holds.service';
import type { CleanupAuditService } from './cleanup-audit.service';
import type { OrphanService } from './orphan.service';
import type { DistributedLock } from './lock';
import type { Redis } from '../database/redis';

function config(overrides: Partial<RetentionConfig> = {}): RetentionConfig {
  return {
    enabled: true,
    dryRunDefault: true,
    safetyWindowDays: 7,
    lockTtlMs: 5000,
    lockRetryMs: 100,
    sweepMs: 86400000,
    categories: Object.fromEntries(RETENTION_CATEGORIES.map((c) => [c, false])) as Record<
      RetentionCategory,
      boolean
    >,
    periods: {},
    ...overrides,
  };
}

function categoriesExcept(
  on: Partial<Record<RetentionCategory, boolean>>,
): Record<RetentionCategory, boolean> {
  return Object.fromEntries(RETENTION_CATEGORIES.map((c) => [c, on[c] ?? false])) as Record<
    RetentionCategory,
    boolean
  >;
}

function stubHandlers(): Record<string, RetentionHandler> {
  return Object.fromEntries(
    RETENTION_CATEGORIES.map((category) => [
      category,
      jest.fn(async (args: HandlerArgs): Promise<HandlerResult> => ({
        eligibleCount: 3,
        skippedLegalHold: 1,
        skippedActiveJob: 0,
        deletedCount: args.canDelete ? 2 : 0,
        sample: [],
        truncated: false,
      })),
    ]),
  );
}

const legalHolds = {
  hasActiveHold: jest.fn(),
  hasAnyActiveHoldForProfile: jest.fn(),
  listActiveHolderIds: jest.fn(async () => []),
  createHold: jest.fn(),
  releaseHold: jest.fn(),
} as unknown as LegalHoldService;

const orphan = { scanJobImages: jest.fn() } as unknown as OrphanService;

function fakeAudit(): CleanupAuditService & { record: jest.Mock } {
  return { record: jest.fn(async () => ({})) } as unknown as CleanupAuditService & {
    record: jest.Mock;
  };
}

function fakeRedis(result: string | null = 'OK') {
  return {
    set: jest.fn(async () => result),
    eval: jest.fn(async () => 1),
  } as unknown as Redis;
}

type FakeLock = DistributedLock & { lose: () => void; stopRenewal: jest.Mock };

/**
 * A lock stub that lets a test observe acquire/release and trip the keepalive's
 * lost-callback on demand.
 */
function fakeLock(acquired = true): FakeLock {
  let onLost: (() => void) | undefined;
  const stop = jest.fn();
  return {
    acquire: jest.fn(async () =>
      acquired ? { token: 'tok-1', acquired: true } : { token: '', acquired: false },
    ),
    release: jest.fn(async () => undefined),
    extend: jest.fn(async () => true),
    startRenewal: jest.fn((_token: string, cb: () => void) => {
      onLost = cb;
      return { stop };
    }),
    lose: () => onLost?.(),
    stopRenewal: stop,
  } as unknown as FakeLock;
}

function build(args: {
  cfg?: RetentionConfig;
  handlers?: Record<string, RetentionHandler>;
  redis?: Redis | null;
  lock?: DistributedLock;
  audit?: ReturnType<typeof fakeAudit>;
}) {
  const audit = args.audit ?? fakeAudit();
  const handlers = args.handlers ?? stubHandlers();
  const service = createRetentionCleanupService({
    prisma: {} as never,
    storage: {} as never,
    redis: args.redis ?? null,
    lock: args.lock,
    policy: retentionPolicyFromConfig(args.cfg ?? config()),
    legalHolds,
    audit,
    orphan,
    handlers,
  });
  return { service, audit, handlers };
}

describe('retention cleanup service', () => {
  it('dry-run writes nothing and needs no lock, even with a deletable category', async () => {
    const audit = fakeAudit();
    const { service, handlers } = build({
      cfg: config({
        dryRunDefault: true,
        categories: categoriesExcept({ proDocuments: true }),
        periods: { proDocuments: 30 },
      }),
      redis: null,
      audit,
    });

    const report = await service.sweep(true);

    expect(report.mode).toBe('DRY_RUN');
    expect(report.skipped).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
    // Redis is irrelevant to a dry-run, so the handler still ran.
    expect(handlers.proDocuments).toHaveBeenCalled();
    const docs = report.categories.find((c) => c.category === 'proDocuments')!;
    expect(docs.deletable).toBe(true);
    expect(docs.wouldDeleteCount).toBe(3);
    expect(docs.deletedCount).toBe(0);
  });

  it('skips a category with no approved period without scanning it', async () => {
    const { service, handlers } = build({
      cfg: config({ categories: categoriesExcept({ proDocuments: true }), periods: {} }),
    });

    const report = await service.sweep(true);

    expect(handlers.proDocuments).not.toHaveBeenCalled();
    const docs = report.categories.find((c) => c.category === 'proDocuments')!;
    expect(docs.periodDays).toBeNull();
    expect(docs.eligibleCount).toBe(0);
  });

  it('fails closed without a lock in an actual sweep', async () => {
    const audit = fakeAudit();
    const handlers = stubHandlers();
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true }),
        periods: { proDocuments: 30 },
      }),
      redis: null,
      audit,
      handlers,
    });

    const report = await service.sweep(false);

    expect(report.skipped).toBe(true);
    expect(report.reason).toBe('LOCK_UNAVAILABLE');
    expect(report.categories).toEqual([]);
    expect(handlers.proDocuments).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('runs an actual sweep under the lock and audits each category', async () => {
    const audit = fakeAudit();
    const handlers = stubHandlers();
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true, messages: true }),
        periods: { proDocuments: 30, messages: 30 },
      }),
      redis: fakeRedis(),
      audit,
      handlers,
    });

    const report = await service.sweep(false);

    expect(report.mode).toBe('ACTUAL');
    expect(report.skipped).toBe(false);
    // A deletable category deletes; a report-only category does not, even when
    // flag and period are both (mis)set.
    expect(handlers__canDelete(handlers, 'proDocuments')).toBe(true);
    expect(handlers__canDelete(handlers, 'messages')).toBe(false);
    const messages = report.categories.find((c) => c.category === 'messages')!;
    expect(messages.reportOnly).toBe(true);
    expect(messages.deletable).toBe(false);
    // Only categories with an approved period are scanned and audited.
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'messages', action: 'REPORT_ONLY' }),
    );
  });

  it('captures a handler failure without aborting the sweep', async () => {
    const audit = fakeAudit();
    const handlers = stubHandlers();
    handlers.proDocuments = jest.fn(async () => {
      throw new Error('s3 unavailable');
    });
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true, selfies: true }),
        periods: { proDocuments: 30, selfies: 30 },
      }),
      redis: fakeRedis(),
      audit,
      handlers,
    });

    const report = await service.sweep(false);

    const docs = report.categories.find((c) => c.category === 'proDocuments')!;
    expect(docs.error).toContain('s3 unavailable');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'proDocuments',
        action: 'CLEANUP_ERROR',
        success: false,
      }),
    );
    // The failure of one category does not stop the next.
    expect(report.categories.find((c) => c.category === 'selfies')!.error).toBeUndefined();
    expect(report.skipped).toBe(false);
  });

  it('keeps the lock alive for the whole sweep and stops the keepalive after', async () => {
    const handlers = stubHandlers();
    const lock = fakeLock();
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true }),
        periods: { proDocuments: 30 },
      }),
      lock,
      handlers,
    });

    const report = await service.sweep(false);

    expect(report.skipped).toBe(false);
    expect(lock.startRenewal).toHaveBeenCalledWith('tok-1', expect.any(Function));
    expect(lock.stopRenewal).toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledWith('tok-1');
  });

  it('stops destructive work as soon as the lock is lost mid-sweep', async () => {
    const audit = fakeAudit();
    const handlers = stubHandlers();
    const lock = fakeLock();
    handlers.proDocuments = jest.fn(async () => {
      // The keepalive reports the lock gone while the first category runs.
      lock.lose();
      return {
        eligibleCount: 1,
        skippedLegalHold: 0,
        skippedActiveJob: 0,
        deletedCount: 1,
        sample: [],
        truncated: false,
      };
    });
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true, selfies: true }),
        periods: { proDocuments: 30, selfies: 30 },
      }),
      lock,
      audit,
      handlers,
    });

    const report = await service.sweep(false);

    expect(handlers.proDocuments).toHaveBeenCalledTimes(1);
    expect(handlers.selfies).not.toHaveBeenCalled();
    const selfies = report.categories.find((c) => c.category === 'selfies')!;
    expect(selfies.skippedReason).toBe('LOCK_LOST');
    expect(report.lockLost).toBe(true);
    // Only the category that ran before the loss is audited.
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a concurrent worker already holds the lock', async () => {
    const handlers = stubHandlers();
    const redis = {
      set: jest.fn(async () => null),
      eval: jest.fn(async () => 1),
    } as unknown as Redis;
    const { service } = build({
      cfg: config({
        dryRunDefault: false,
        categories: categoriesExcept({ proDocuments: true }),
        periods: { proDocuments: 30 },
      }),
      redis,
      handlers,
    });

    const report = await service.sweep(false);

    expect(report.skipped).toBe(true);
    expect(report.reason).toBe('LOCK_UNAVAILABLE');
    expect(handlers.proDocuments).not.toHaveBeenCalled();
  });
});

function handlers__canDelete(
  handlers: Record<string, RetentionHandler>,
  category: string,
): boolean {
  const mock = handlers[category] as unknown as jest.Mock;
  const args = mock.mock.calls[0]?.[0] as HandlerArgs | undefined;
  return args?.canDelete === true;
}
