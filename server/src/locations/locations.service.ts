import type { PrismaClient } from '../database/prisma';

/**
 * Locations domain service.
 *
 * Location capture, geocoding and proximity queries. Backs nearby-job
 * matching and live job tracking.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class LocationsService {
  constructor(private readonly prisma: PrismaClient) {}
}
