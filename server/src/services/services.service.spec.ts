import type { PrismaClient } from '../database/prisma';
import { createServicesService } from './services.service';

const prisma = {
  service: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

const servicesService = createServicesService({ prisma });

describe('servicesService.list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active services in display order', async () => {
    (prisma.service.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: 'water' },
      { id: 's2', slug: 'cleaning', name: 'Cleaning', icon: 'sparkles' },
    ]);

    await expect(servicesService.list()).resolves.toEqual([
      { id: 's1', slug: 'plumbing', name: 'Plumbing', icon: 'water' },
      { id: 's2', slug: 'cleaning', name: 'Cleaning', icon: 'sparkles' },
    ]);
  });

  it('scopes the list to active services, ordered by sortOrder', async () => {
    (prisma.service.findMany as jest.Mock).mockResolvedValue([]);

    await servicesService.list();

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });
  });
});