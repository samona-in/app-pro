import type { PrismaClient } from '../database/prisma';

/**
 * Pros domain service.
 *
 * Professional profiles: skills, documents, verification state and service
 * radius.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class ProsService {
  constructor(private readonly prisma: PrismaClient) {}
}
