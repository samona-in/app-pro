import { createServicesService } from './services.service';

describe('createServicesService', () => {
  function buildService() {
    const prisma = {
      service: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      serviceWorkGroup: { findMany: jest.fn() },
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
      {
        id: 'sk1',
        slug: 'fan-installation',
        name: 'Fan installation',
        icon: 'flash-outline',
        groupId: null,
        basePricePaise: 75000,
      },
      {
        id: 'sk2',
        slug: 'light-fixture-installation',
        name: 'Light fixture installation',
        icon: 'flash-outline',
        groupId: null,
        basePricePaise: null,
      },
    ];
    prisma.skill.findMany.mockResolvedValue(rows);

    const result = await service.listSkillsForService('electrical');

    expect(result).toEqual(rows);
    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { service: { slug: 'electrical' }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        serviceId: true,
        slug: true,
        name: true,
        icon: true,
        groupId: true,
        basePricePaise: true,
        pricingModel: true,
        unitLabel: true,
        minQuantity: true,
        maxQuantity: true,
        minDurationMinutes: true,
        maxDurationMinutes: true,
        durationStepMinutes: true,
      },
    });
  });

  it('returns active groups with active works in configured order', async () => {
    const { service, prisma } = buildService();
    const serviceRow = { id: 'service-1', slug: 'electrician', name: 'Electrician', icon: null };
    prisma.service.findFirst.mockResolvedValue(serviceRow);
    prisma.serviceWorkGroup.findMany.mockResolvedValue([
      {
        id: 'group-fans',
        serviceId: 'service-1',
        name: 'Fans',
        slug: 'fans',
        imageUrl: 'asset://service-work-groups/fans',
        sortOrder: 1,
        isActive: true,
        skills: [
          {
            id: 'skill-1',
            serviceId: 'service-1',
            slug: 'fan-repair',
            name: 'Fan repair',
            icon: null,
            groupId: 'group-fans',
            basePricePaise: 125000,
          },
        ],
      },
      {
        id: 'group-empty',
        serviceId: 'service-1',
        name: 'Empty group',
        slug: 'empty-group',
        imageUrl: null,
        sortOrder: 2,
        isActive: true,
        skills: [],
      },
    ]);

    const result = await service.listSkillGroupsForService('electrician');

    expect(result).toEqual({
      service: serviceRow,
      groups: [
        {
          id: 'group-fans',
          serviceId: 'service-1',
          name: 'Fans',
          slug: 'fans',
          imageUrl: 'asset://service-work-groups/fans',
          sortOrder: 1,
          isActive: true,
          works: [
            {
              id: 'skill-1',
              serviceId: 'service-1',
              slug: 'fan-repair',
              name: 'Fan repair',
              icon: null,
              groupId: 'group-fans',
              basePricePaise: 125000,
            },
          ],
        },
      ],
    });
    expect(prisma.serviceWorkGroup.findMany).toHaveBeenCalledWith({
      where: {
        serviceId: 'service-1',
        isActive: true,
        skills: { some: { serviceId: 'service-1', isActive: true } },
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        serviceId: true,
        name: true,
        slug: true,
        imageUrl: true,
        sortOrder: true,
        isActive: true,
        skills: {
          where: { serviceId: 'service-1', isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            serviceId: true,
            slug: true,
            name: true,
            icon: true,
            groupId: true,
            basePricePaise: true,
            pricingModel: true,
            unitLabel: true,
            minQuantity: true,
            maxQuantity: true,
            minDurationMinutes: true,
            maxDurationMinutes: true,
            durationStepMinutes: true,
          },
        },
      },
    });
  });

  it('returns null when the service does not exist or is inactive', async () => {
    const { service, prisma } = buildService();
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(service.listSkillGroupsForService('missing')).resolves.toBeNull();
    expect(prisma.serviceWorkGroup.findMany).not.toHaveBeenCalled();
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
          basePricePaise: 90000,
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
          basePricePaise: null,
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
          isTopPick: true,
          skill: {
            select: {
              id: true,
              serviceId: true,
              slug: true,
              name: true,
              icon: true,
              basePricePaise: true,
              pricingModel: true,
              unitLabel: true,
              minQuantity: true,
              maxQuantity: true,
              minDurationMinutes: true,
              maxDurationMinutes: true,
              durationStepMinutes: true,
              service: { select: { id: true, slug: true, name: true, icon: true } },
            },
          },
        },
      });
    });
  });
});
