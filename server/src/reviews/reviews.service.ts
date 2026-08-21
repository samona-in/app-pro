import type { PrismaClient } from '../database/prisma';

/**
 * Reviews domain service.
 *
 * Ratings and reviews, and the reputation they roll up into.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class ReviewsService {
  constructor(private readonly prisma: PrismaClient) {}
}
