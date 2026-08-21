import type { PrismaClient } from '../database/prisma';

export interface LocationsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Locations domain service.
 *
 * Location capture, geocoding and proximity queries. Backs nearby-job
 * matching and live job tracking.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createLocationsService(deps: LocationsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type LocationsService = ReturnType<typeof createLocationsService>;
