import type { Prisma } from '../generated/prisma/client';
import type { PrismaClient } from '../database/prisma';
import type { CleanupAuditEntry } from './types';

export interface CleanupAuditServiceDeps {
  prisma: PrismaClient;
}

export function createCleanupAuditService(deps: CleanupAuditServiceDeps) {
  async function record(entry: CleanupAuditEntry) {
    // Never log PII; truncate long errors
    const error = entry.error ? entry.error.slice(0, 2000) : null;
    return deps.prisma.cleanupAuditLog.create({
      data: {
        category: entry.category,
        action: entry.action,
        affectedCount: entry.affectedCount,
        executionMode: entry.executionMode,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt ?? null,
        success: entry.success,
        error,
        metadata:
          entry.metadata === null || entry.metadata === undefined
            ? undefined
            : (entry.metadata as Prisma.InputJsonValue),
        jobId: entry.jobId ?? null,
      },
    });
  }

  return { record };
}

export type CleanupAuditService = ReturnType<typeof createCleanupAuditService>;
