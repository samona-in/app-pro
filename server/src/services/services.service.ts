import type { PrismaClient } from '../database/prisma';
import type { PopularSkill, ServiceOption, ServiceSearchResult, SkillOption } from '@samona/types';
import { POPULAR_SKILL_SLUGS } from './popular-skills';

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
   * The curation lives in `popular-skills.ts`; this resolves each entry
   * against the live catalogue, so names and icons stay current, and skips
   * anything the catalogue no longer offers.
   */
  async function listPopularSkills(): Promise<PopularSkill[]> {
    const skills = await deps.prisma.skill.findMany({
      where: {
        isActive: true,
        slug: { in: POPULAR_SKILL_SLUGS },
        service: { isActive: true },
      },
      // A curated slug is unique across the catalogue today. Ordering by the
      // parent service first keeps the first match deterministic if that ever
      // stops being true, instead of letting the row order decide.
      orderBy: [{ service: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: {
        id: true,
        serviceId: true,
        slug: true,
        name: true,
        icon: true,
        service: { select: { id: true, slug: true, name: true, icon: true } },
      },
    });

    const bySlug = new Map<string, PopularSkill>();
    for (const skill of skills) {
      if (!bySlug.has(skill.slug)) bySlug.set(skill.slug, skill);
    }

    return POPULAR_SKILL_SLUGS.flatMap((slug) => {
      const skill = bySlug.get(slug);
      return skill ? [skill] : [];
    });
  }

  return { listActive, listSkillsForService, listPopularSkills, searchServices };
}

export type ServicesService = ReturnType<typeof createServicesService>;
