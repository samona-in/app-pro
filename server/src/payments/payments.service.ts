import type { PrismaClient } from '../database/prisma';

export interface PaymentsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Payments domain service.
 *
 * Payment intents, capture and refunds. Amounts are always computed
 * server-side; a client-supplied price is never trusted.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createPaymentsService(deps: PaymentsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
