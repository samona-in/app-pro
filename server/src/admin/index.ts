import { Router } from 'express';
import type { Services } from '../context';
import type { PrismaClient } from '../database/prisma';
import type { Redis } from '../database/redis';
import { createAdminAuthService } from './auth/admin-auth.service';
import { createAdminAuthRouter } from './auth/admin-auth.routes';
import { createRequireAdmin, requirePermission } from './middleware/require-admin';

export interface AdminRouterDeps {
  redis: Redis | null;
  prisma: PrismaClient | null;
}

export function createAdminRouter(services: Services, deps: AdminRouterDeps): Router {
  const router = Router();
  const prisma = deps.prisma as any;

  const adminAuth = createAdminAuthService({
    prisma,
    redis: deps.redis,
    verifier: services.tokenVerifier,
  });

  router.use('/auth', createAdminAuthRouter(services, adminAuth));

  const requireAdmin = createRequireAdmin(adminAuth);
  router.use(requireAdmin);

  // Dashboard
  router.get('/dashboard/overview', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const [totalCustomers, totalProfessionals, activeJobs, completedJobs] = await Promise.all([
        prisma.customerProfile.count(),
        prisma.proProfile.count(),
        prisma.job.count({
          where: { status: { in: ['ACCEPTED', 'TRAVELLING', 'ARRIVED', 'IN_PROGRESS'] } },
        }),
        prisma.job.count({ where: { status: 'COMPLETED' } }),
      ]);

      res.json({
        metrics: {
          totalCustomers,
          totalProfessionals,
          activeJobs,
          completedJobs,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Customers
  router.get('/customers', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const customers = await prisma.customerProfile.findMany({
        take: 50,
        include: { profile: true },
      });
      res.json({ data: customers });
    } catch (error) {
      next(error);
    }
  });

  // Professionals
  router.get('/professionals', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const professionals = await prisma.proProfile.findMany({
        take: 50,
        include: { profile: true },
      });
      res.json({ data: professionals });
    } catch (error) {
      next(error);
    }
  });

  // Jobs
  router.get('/jobs', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const jobs = await prisma.job.findMany({
        take: 50,
        include: { customer: true, pro: true, service: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ data: jobs });
    } catch (error) {
      next(error);
    }
  });

  // Services / categories
  router.get('/categories', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const categories = await prisma.service.findMany({ include: { skills: true } });
      res.json({ data: categories });
    } catch (error) {
      next(error);
    }
  });

  // Audit logs — readable by Super Admins and Operations Admins only.
  router.get('/audit-logs', requirePermission('audit:read'), async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const logs = await prisma.adminAuditLog.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { adminUser: { include: { profile: true } } },
      });
      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
