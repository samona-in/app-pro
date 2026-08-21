import type { PrismaClient } from '../database/prisma';

/**
 * Jobs domain service.
 *
 * The job lifecycle and its state machine. Every transition is validated
 * here against JOB_STATUS_TRANSITIONS before it is written, and each change
 * is recorded in JobStatusHistory.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class JobsService {
  constructor(private readonly prisma: PrismaClient) {}
}
