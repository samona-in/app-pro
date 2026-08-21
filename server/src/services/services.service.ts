import type { PrismaClient } from '../database/prisma';

export interface ServicesServiceDeps {
  prisma: PrismaClient;
}

/**
 * Services domain service.
 *
 * The service and skill catalogue professionals select from (plumbing,
 * electrical, cleaning).
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createServicesService(deps: ServicesServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type ServicesService = ReturnType<typeof createServicesService>;
