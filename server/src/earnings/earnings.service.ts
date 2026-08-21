import type { PrismaClient } from '../database/prisma';

/**
 * Earnings domain service.
 *
 * Derives professional earnings, fees and payouts from completed jobs.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class EarningsService {
  constructor(private readonly prisma: PrismaClient) {}
}
