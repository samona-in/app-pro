import type { PrismaClient } from '../database/prisma';

export function createBannersService(prisma: PrismaClient) {
  return {
    async listActive() {
      const banners = await prisma.banner.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      return banners.map((banner) => ({
        id: banner.key || banner.id,
        key: banner.key,
        heading: banner.heading,
        subtitle: banner.subtitle,
        ctaLabel: banner.ctaLabel,
        serviceSlug: banner.serviceSlug,
        image: banner.image,
        imageDescription: banner.imageDescription,
        sortOrder: banner.sortOrder,
        isActive: banner.isActive,
      }));
    },

    async listAll() {
      return prisma.banner.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    },

    async create(data: {
      key: string;
      heading: string;
      subtitle: string;
      ctaLabel: string;
      serviceSlug?: string | null;
      image: string;
      imageDescription: string;
      sortOrder?: number;
      isActive?: boolean;
    }) {
      return prisma.banner.create({ data });
    },

    async update(
      id: string,
      data: {
        key?: string;
        heading?: string;
        subtitle?: string;
        ctaLabel?: string;
        serviceSlug?: string | null;
        image?: string;
        imageDescription?: string;
        sortOrder?: number;
        isActive?: boolean;
      },
    ) {
      return prisma.banner.update({ where: { id }, data });
    },

    async delete(id: string) {
      await prisma.banner.delete({ where: { id } });
      return { success: true };
    },
  };
}

export type BannersService = ReturnType<typeof createBannersService>;
