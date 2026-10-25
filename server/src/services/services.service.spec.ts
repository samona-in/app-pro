import { createServicesService } from './services.service';

describe('createServicesService', () => {
  function buildService() {
    const prisma = {
      service: {
        findMany: jest.fn(),
      },
      skill: {
        findMany: jest.fn(),
      },
      popularSkill: {
        findMany: jest.fn(),
      },
    };

    const service = createServicesService({ prisma: prisma as never });
    return { service, prisma };
  }

  it('listActive returns only active services in display order', async () => {
    const { service, prisma } = buildService();
    const rows = [
      { id: 's1', slug: 'electrical', name: 'Electrical', icon: 'flash-outline' },
      { id: 's2', slug: 'plumbing', name: 'Plumbing', icon: 'water-outline' },
    ];
    prisma.service.findMany.mockResolvedValue(rows);

    const result = await service.listActive();

    expect(result).toEqual(rows);
    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });
  });

  it('listSkillsForService returns only active skills in display order', async () => {
    const { service, prisma } = buildService();
    const rows = [
      { id: 'sk1', slug: 'fan-installation', name: 'Fan installation', icon: 'flash-outline' },
      {
        id: 'sk2',
        slug: 'light-fixture-installation',
        name: 'Light fixture installation',
        icon: 'flash-outline',
      },
    ];
    prisma.skill.findMany.mockResolvedValue(rows);

    const result = await service.listSkillsForService('electrical');

    expect(result).toEqual(rows);
    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { service: { slug: 'electrical' }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, serviceId: true, slug: true, name: true, icon: true },
    });
  });

  describe('listPopularSkills', () => {
    const popularRows = [
      {
        skill: {
          id: 'sk1',
          serviceId: 's1',
          slug: 'leak-repair',
          name: 'Plumbing leak repair',
          icon: 'https://example.test/leak.png',
          service: { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: null },
        },
      },
      {
        skill: {
          id: 'sk2',
          serviceId: 's2',
          slug: 'fan-installation',
          name: 'Fan installation',
          icon: null,
          service: { id: 's2', slug: 'electrician', name: 'Electrician', icon: null },
        },
      },
    ];

    it('returns the curated skills with their parent service', async () => {
      const { service, prisma } = buildService();
      prisma.popularSkill.findMany.mockResolvedValue(popularRows);

      const result = await service.listPopularSkills();

      expect(result).toEqual([popularRows[0]!.skill, popularRows[1]!.skill]);
      expect(prisma.popularSkill.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          skill: { isActive: true, service: { isActive: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
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
    });
  });
});
