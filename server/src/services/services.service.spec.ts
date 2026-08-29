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
      { id: 'sk1', slug: 'fan-installation', name: 'Fan installation' },
      { id: 'sk2', slug: 'light-fixture-installation', name: 'Light fixture installation' },
    ];
    prisma.skill.findMany.mockResolvedValue(rows);

    const result = await service.listSkillsForService('electrical');

    expect(result).toEqual(rows);
    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { service: { slug: 'electrical' }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, serviceId: true, slug: true, name: true },
    });
  });
});
