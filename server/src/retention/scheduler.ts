import { logger } from '../common/logger';
import type { RetentionCleanupService } from './cleanup.service';

export interface RetentionSchedulerDeps {
  cleanup: RetentionCleanupService;
  sweepMs: number;
  enabled: boolean;
  dryRunDefault: boolean;
}

export function createRetentionScheduler(deps: RetentionSchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (!deps.enabled) {
      logger.info('Retention scheduler disabled');
      return;
    }
    if (timer) return;
    timer = setInterval(() => {
      void deps.cleanup.sweep(deps.dryRunDefault).catch((err) => {
        logger.error('Retention sweep tick failed', err);
      });
    }, deps.sweepMs);
    logger.info('Retention scheduler started', {
      sweepMs: deps.sweepMs,
      dryRunDefault: deps.dryRunDefault,
    });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop };
}

export type RetentionScheduler = ReturnType<typeof createRetentionScheduler>;
