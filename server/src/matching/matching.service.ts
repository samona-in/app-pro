import type { PrismaClient } from '../database/prisma';

/**
 * Matching domain service.
 *
 * Selects which professionals see a job request, from location, skills,
 * availability and rating. Internal domain service with no HTTP surface —
 * jobs drives it.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class MatchingService {
  constructor(private readonly prisma: PrismaClient) {}
}
