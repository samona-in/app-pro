import { seedServiceWorkGroups } from './service-work-groups.seed';

function buildPrisma(services: unknown[]) {
  const prisma = {
    service: { findMany: jest.fn().mockResolvedValue(services) },
    serviceWorkGroup: {
      upsert: jest.fn(async ({ create }: { create: { serviceId: string; slug: string } }) => ({
        id: `${create.serviceId}:${create.slug}`,
      })),
    },
    skill: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return prisma;
}

describe('seedServiceWorkGroups', () => {
  it('upserts configured groups and assigns works in idempotent batches', async () => {
    const prisma = buildPrisma([
      {
        id: 'service-1',
        slug: 'electrician',
        name: 'Electrician',
        isActive: true,
        skills: [
          { id: 'skill-fan-repair', slug: 'fan-repair', name: 'Fan repair', isActive: true },
          {
            id: 'skill-fan-installation',
            slug: 'fan-installation',
            name: 'Fan installation',
            isActive: true,
          },
          { id: 'skill-other', slug: 'other', name: 'Other', isActive: true },
        ],
      },
    ]);

    await expect(seedServiceWorkGroups(prisma as never)).resolves.toEqual({ groups: 2, works: 3 });
    await expect(seedServiceWorkGroups(prisma as never)).resolves.toEqual({ groups: 2, works: 3 });
    expect(prisma.serviceWorkGroup.upsert).toHaveBeenCalledTimes(4);
    expect(prisma.serviceWorkGroup.upsert).toHaveBeenCalledWith({
      where: { serviceId_slug: { serviceId: 'service-1', slug: 'fans' } },
      create: {
        serviceId: 'service-1',
        slug: 'fans',
        name: 'Fans',
        imageUrl: 'asset://service-work-groups/fan',
        sortOrder: 1,
        isActive: true,
      },
      update: {
        name: 'Fans',
        imageUrl: 'asset://service-work-groups/fan',
        sortOrder: 1,
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.skill.updateMany).toHaveBeenCalledWith({
      where: {
        serviceId: 'service-1',
        id: { in: ['skill-fan-repair', 'skill-fan-installation'] },
        isActive: true,
      },
      data: { groupId: 'service-1:fans' },
    });
  });

  it('reports unclassified active works before changing the database', async () => {
    const prisma = buildPrisma([
      {
        id: 'service-1',
        slug: 'electrician',
        name: 'Electrician',
        isActive: true,
        skills: [{ id: 'skill-unknown', slug: 'unknown-job', name: 'Unknown job', isActive: true }],
      },
    ]);

    await expect(seedServiceWorkGroups(prisma as never)).rejects.toThrow(
      'electrician / unknown-job (Unknown job)',
    );
    expect(prisma.serviceWorkGroup.upsert).not.toHaveBeenCalled();
    expect(prisma.skill.updateMany).not.toHaveBeenCalled();
  });
});
