import { loadConfig, loadEnvFile } from '../config';
import { logger } from '../common/logger';
import { createPrismaClient } from '../database/prisma';
import { createRedisClient } from '../database/redis';
import { createStorageFromConfig } from '../context';
import { retentionPolicyFromConfig } from './policy';
import { createLegalHoldService } from './legal-holds.service';
import { createCleanupAuditService } from './cleanup-audit.service';
import { createOrphanService } from './orphan.service';
import { createRetentionCleanupService } from './cleanup.service';
import type { SweepReport } from './types';

/**
 * Retention sweep CLI.
 *
 * Defaults to a dry-run: it prints the structured report to stdout and touches
 * nothing — no rows, no objects, no holds and no audit entries. `--commit`
 * attempts an actual sweep, which the engine still refuses to delete from
 * unless the global enable flag and per-category flags/periods are set.
 *
 * Usage:
 *   npm run retention:dry-run --workspace @samona/server
 *   npm run retention:sweep  --workspace @samona/server   # still gated by flags
 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const dryRun = !process.argv.includes('--commit');

  if (!dryRun && !config.retention.enabled) {
    logger.error(
      'Refusing to commit: RETENTION_CLEANUP_ENABLED is not true. ' +
        'Enable it (and the category flags/periods) before running a destructive sweep.',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient(config.databaseUrl);
  let redis: ReturnType<typeof createRedisClient> | null = null;
  if (!dryRun) {
    try {
      const client = createRedisClient(config.redisUrl);
      await client.connect();
      if (client.status === 'ready') {
        redis = client;
      } else {
        await client.quit().catch(() => undefined);
      }
    } catch (error) {
      logger.error('Could not connect to Redis; a destructive sweep will fail closed.', error);
    }
  }

  try {
    const storage = createStorageFromConfig(config);
    const policy = retentionPolicyFromConfig(config.retention);
    const legalHolds = createLegalHoldService({ prisma });
    const audit = createCleanupAuditService({ prisma });
    const orphan = createOrphanService({
      prisma,
      storage,
      safetyWindowDays: config.retention.safetyWindowDays,
    });
    const cleanup = createRetentionCleanupService({
      prisma,
      storage,
      redis,
      policy,
      legalHolds,
      audit,
      orphan,
    });

    const report: SweepReport = await cleanup.sweep(dryRun);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (redis) await redis.quit().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  logger.error('Retention CLI failed.', error);
  process.exit(1);
});
