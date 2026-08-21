import type { PrismaClient } from '../database/prisma';

/**
 * Services domain service.
 *
 * The service and skill catalogue professionals select from (plumbing,
 * electrical, cleaning).
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class ServicesService {
  constructor(private readonly prisma: PrismaClient) {}
}
