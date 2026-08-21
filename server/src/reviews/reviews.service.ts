import type { PrismaClient } from '../database/prisma';

export interface ReviewsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Reviews domain service.
 *
 * Ratings and reviews, and the reputation they roll up into.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createReviewsService(deps: ReviewsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type ReviewsService = ReturnType<typeof createReviewsService>;
