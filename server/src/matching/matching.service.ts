import type { PrismaClient } from '../database/prisma';

export interface MatchingServiceDeps {
  prisma: PrismaClient;
}

/**
 * Matching domain service.
 *
 * Selects which professionals see a job request, from location, skills,
 * availability and rating. Internal domain service with no HTTP surface —
 * jobs drives it.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createMatchingService(deps: MatchingServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type MatchingService = ReturnType<typeof createMatchingService>;
