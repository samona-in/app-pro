import type { PrismaClient } from '../database/prisma';

export interface JobsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Jobs domain service.
 *
 * The job lifecycle and its state machine. Every transition is validated
 * here against JOB_STATUS_TRANSITIONS before it is written, and each change
 * is recorded in JobStatusHistory.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createJobsService(deps: JobsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type JobsService = ReturnType<typeof createJobsService>;
