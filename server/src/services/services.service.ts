import type { PrismaClient } from '../database/prisma';
import type { ServiceOption } from '@samona/types';

export interface ServicesServiceDeps {
  prisma: PrismaClient;
}

/**
 * Services domain service.
 *
 * The service and skill catalogue customers browse and professionals select
 * from (plumbing, electrical, cleaning).
 */
export function createServicesService(deps: ServicesServiceDeps) {
  /**
   * The active service catalogue shown on the customer home screen.
   *
   * Ordered by `sortOrder` so the marketplace's intended hierarchy is stable
   * across clients. `ServiceOption` is shared with the Pro onboarding
   * catalogue so the two apps cannot drift apart.
   */
  async function listActive(): Promise<ServiceOption[]> {
    const services = await deps.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });

    return services;
  }

  return { listActive };
}

export type ServicesService = ReturnType<typeof createServicesService>;
