import type { PrismaClient } from '../database/prisma';
import type { PopularSkill, ServiceOption, ServiceSearchResult, SkillOption } from '@samona/types';

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

  /**
   * The active job categories for one service, in display order.
   *
   * This is what the booking flow's "exact need" step renders after the
   * customer picks a service on the home grid.
   */
  async function listSkillsForService(slug: string): Promise<SkillOption[]> {
    const skills = await deps.prisma.skill.findMany({
      where: { isActive: true, service: { slug } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, serviceId: true, slug: true, name: true, icon: true },
    });

    return skills;
  }

  /**
   * Full-text catalogue search across service names and skill names.
   *
   * Returns both matching services and matching skills (with their parent
   * service embedded). The client renders two sections from the single
   * response so one round-trip covers both result types.
   */
  async function searchServices(query: string): Promise<ServiceSearchResult> {
    const [services, skills] = await Promise.all([
      deps.prisma.service.findMany({
        where: { isActive: true, name: { contains: query, mode: 'insensitive' } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, slug: true, name: true, icon: true },
      }),
      deps.prisma.skill.findMany({
        where: {
          isActive: true,
          name: { contains: query, mode: 'insensitive' },
          service: { isActive: true },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          serviceId: true,
          slug: true,
          name: true,
          icon: true,
          service: { select: { id: true, slug: true, name: true, icon: true } },
        },
      }),
    ]);

    return { services, skills };
  }

  /**
   * The skills promoted on the customer home screen, in curated order.
   *
   * Managed via the admin panel; falls back to an empty list if none are configured.
   */
  async function listPopularSkills(): Promise<PopularSkill[]> {
    const entries = await deps.prisma.popularSkill.findMany({
      where: {
        isActive: true,
        skill: { isActive: true, service: { isActive: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        isTopPick: true,
        skill: {
          select: {
            id: true,
            serviceId: true,
            slug: true,
            name: true,
            icon: true,
            service: { select: { id: true, slug: true, name: true, icon: true } },
          },
        },
      },
    });

    return entries.map((entry) => ({ ...entry.skill, isTopPick: entry.isTopPick }));
  }

  return { listActive, listSkillsForService, listPopularSkills, searchServices };
}

export type ServicesService = ReturnType<typeof createServicesService>;
