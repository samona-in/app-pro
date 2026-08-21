import type { PrismaClient } from '../database/prisma';

export interface EarningsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Earnings domain service.
 *
 * Derives professional earnings, fees and payouts from completed jobs.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createEarningsService(deps: EarningsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type EarningsService = ReturnType<typeof createEarningsService>;
