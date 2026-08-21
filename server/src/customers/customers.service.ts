import type { PrismaClient } from '../database/prisma';

export interface CustomersServiceDeps {
  prisma: PrismaClient;
}

/**
 * Customers domain service.
 *
 * Customer profiles and saved addresses. Reserved for the customer app; the
 * Pro app never reads it directly.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createCustomersService(deps: CustomersServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type CustomersService = ReturnType<typeof createCustomersService>;
