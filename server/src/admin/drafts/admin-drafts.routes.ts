import { Router } from 'express';
import type { PrismaClient } from '../../database/prisma';

export interface AdminDraftsRouterDeps {
  prisma: PrismaClient | null;
}

interface ServiceActivity {
  serviceId: string;
  serviceName: string;
  active: number;
  converted: number;
  abandoned: number;
  total: number;
}

/**
 * Admin analytics for saved booking carts, mounted at `/admin/drafts`.
 *
 * Drafts are the requests customers were still building when they left. They
 * are kept after conversion or abandonment precisely so this view can answer
 * "which services attract carts that never become bookings?" — the signal the
 * catalogue team uses to tune pricing and copy.
 *
 * Read-only. Prices on a draft are estimates, so the totals here are activity
 * indicators, not revenue.
 */
export function createAdminDraftsRouter({ prisma }: AdminDraftsRouterDeps): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    try {
      const [active, converted, abandoned, grouped] = await Promise.all([
        prisma.bookingDraft.count({ where: { status: 'ACTIVE' } }),
        prisma.bookingDraft.count({ where: { status: 'CONVERTED' } }),
        prisma.bookingDraft.count({ where: { status: 'ABANDONED' } }),
        prisma.bookingDraft.groupBy({
          by: ['serviceId', 'status'],
          _count: { _all: true },
        }),
      ]);

      // Resolve service names in one read rather than per group.
      const serviceIds = [...new Set(grouped.map((row) => row.serviceId))];
      const services = serviceIds.length
        ? await prisma.service.findMany({
            where: { id: { in: serviceIds } },
            select: { id: true, name: true },
          })
        : [];
      const serviceNames = new Map(services.map((service) => [service.id, service.name] as const));

      const byService = new Map<string, ServiceActivity>();
      for (const row of grouped) {
        const count = row._count._all;
        const entry =
          byService.get(row.serviceId) ??
          ({
            serviceId: row.serviceId,
            serviceName: serviceNames.get(row.serviceId) ?? 'Unknown service',
            active: 0,
            converted: 0,
            abandoned: 0,
            total: 0,
          } satisfies ServiceActivity);

        if (row.status === 'ACTIVE') entry.active += count;
        else if (row.status === 'CONVERTED') entry.converted += count;
        else entry.abandoned += count;
        entry.total += count;

        byService.set(row.serviceId, entry);
      }

      const recentRows = await prisma.bookingDraft.findMany({
        take: 25,
        orderBy: { updatedAt: 'desc' },
        include: {
          service: { select: { name: true } },
          customer: {
            select: {
              displayName: true,
              profile: { select: { fullName: true } },
            },
          },
          items: { select: { quantity: true } },
        },
      });

      res.json({
        generatedAt: new Date().toISOString(),
        totals: { active, converted, abandoned, total: active + converted + abandoned },
        byService: [...byService.values()].sort((a, b) => b.total - a.total),
        recent: recentRows.map((row) => ({
          id: row.id,
          status: row.status,
          serviceName: row.service.name,
          customerName: row.customer.displayName ?? row.customer.profile?.fullName ?? null,
          worksCount: row.items.length,
          estimatedTotalPaise: row.estimatedTotalPaise,
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
