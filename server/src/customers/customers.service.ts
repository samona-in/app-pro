import type { PrismaClient } from '../database/prisma';

/**
 * Customers domain service.
 *
 * Customer profiles and saved addresses. Reserved for the customer app; the
 * Pro app never reads it directly.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class CustomersService {
  constructor(private readonly prisma: PrismaClient) {}
}
