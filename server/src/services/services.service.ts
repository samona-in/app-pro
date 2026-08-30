import type { ServiceSummaryDto } from '@samona/types';
import type { PrismaClient } from '../database/prisma';

export interface ServicesServiceDeps {
  prisma: PrismaClient;
}

/**
 * Services domain service.
 *
 * The service and skill catalogue professionals select from (plumbing,
 * electrical, cleaning). A customer files a request against a service, so the
 * listing is shared across both surfaces.
 */
export function createServicesService(deps: ServicesServiceDeps) {
  /** Active services in display order, as the customer's "choose a service". */
  async function list(): Promise<ServiceSummaryDto[]> {
    const rows = await deps.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
    }));
  }

  return { list };
}

export type ServicesService = ReturnType<typeof createServicesService>;
