import type { PrismaClient } from '../database/prisma';

/**
 * Payments domain service.
 *
 * Payment intents, capture and refunds. Amounts are always computed
 * server-side; a client-supplied price is never trusted.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class PaymentsService {
  constructor(private readonly prisma: PrismaClient) {}
}
