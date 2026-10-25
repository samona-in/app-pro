import { Router } from 'express';
import type { Services } from '../context';
import type { PrismaClient } from '../database/prisma';
import type { Redis } from '../database/redis';
import { createAdminAuthService } from './auth/admin-auth.service';
import { createAdminAuthRouter } from './auth/admin-auth.routes';
import { createAdminJobsRouter } from './jobs/admin-jobs.routes';
import { createAdminLiveRouter } from './live/admin-live.routes';
import { createRequireAdmin, requirePermission } from './middleware/require-admin';
import { createBannerSchema, updateBannerSchema } from '@samona/validation';
import { validate } from '../common';

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
        orderBy: { createdAt: 'desc' },
      });
      res.json({ data: customers });
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const customer = await prisma.customerProfile.findUnique({
        where: { id: req.params.id },
        include: { profile: true, savedAddresses: true },
      });

      if (!customer) {
        res.status(404).json({ error: { message: 'Customer not found' } });
        return;
      }

      res.json({ data: customer });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/customers/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { displayName, avatarUrl, locationLabel, latitude, longitude } = req.body;

      const updated = await prisma.customerProfile.update({
        where: { id: req.params.id },
        data: {
          ...(displayName !== undefined && { displayName }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          ...(locationLabel !== undefined && { locationLabel }),
          ...(latitude !== undefined && latitude !== null && { latitude: Number(latitude) }),
          ...(longitude !== undefined && longitude !== null && { longitude: Number(longitude) }),
        },
        include: { profile: true },
      });

      res.json({ data: updated });
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
        orderBy: { createdAt: 'desc' },
      });
      res.json({ data: professionals });
    } catch (error) {
      next(error);
    }
  });

  router.get('/professionals/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const professional = await prisma.proProfile.findUnique({
        where: { id: req.params.id },
        include: {
          profile: true,
          services: { include: { service: true } },
          skills: { include: { skill: true } },
          documents: true,
        },
      });

      if (!professional) {
        res.status(404).json({ error: { message: 'Professional not found' } });
        return;
      }

      res.json({ data: professional });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/professionals/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { displayName, bio, experienceLevel, serviceRadiusKm, isVerified, isOnline, latitude, longitude, locationLabel } = req.body;

      const updated = await prisma.proProfile.update({
        where: { id: req.params.id },
        data: {
          ...(displayName !== undefined && { displayName }),
          ...(bio !== undefined && { bio }),
          ...(experienceLevel !== undefined && { experienceLevel }),
          ...(serviceRadiusKm !== undefined && { serviceRadiusKm: Number(serviceRadiusKm) }),
          ...(isVerified !== undefined && { isVerified: Boolean(isVerified) }),
          ...(isOnline !== undefined && { isOnline: Boolean(isOnline) }),
          ...(latitude !== undefined && latitude !== null && { latitude: Number(latitude) }),
          ...(longitude !== undefined && longitude !== null && { longitude: Number(longitude) }),
          ...(locationLabel !== undefined && { locationLabel }),
        },
        include: { profile: true },
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/professionals/:id/services/:serviceId', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { status, rejectionReason } = req.body;

      const existing = await prisma.proService.findUnique({
        where: {
          proProfileId_serviceId: {
            proProfileId: req.params.id,
            serviceId: req.params.serviceId,
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: { message: 'Service not found' } });
        return;
      }

      const updated = await prisma.proService.update({
        where: {
          proProfileId_serviceId: {
            proProfileId: req.params.id,
            serviceId: req.params.serviceId,
          },
        },
        data: {
          status,
          ...(status === 'REJECTED' && rejectionReason !== undefined && { rejectionReason }),
          ...(status === 'ACCEPTED' && { rejectionReason: null }),
          ...(status === 'PENDING' && { rejectionReason: null }),
        },
        include: { service: true },
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.get('/professionals/:id/documents/:documentId/content-url', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const document = await prisma.proDocument.findFirst({
        where: { id: req.params.documentId, proProfileId: req.params.id },
        select: { storagePath: true },
      });

      if (!document) {
        res.status(404).json({ error: { message: 'Document not found' } });
        return;
      }

      const url = await services.storage.documentContentUrl(document.storagePath);
      res.json({ url });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/professionals/:id/documents/:documentId', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { status, rejectionReason } = req.body;

      if (!status) {
        res.status(400).json({ error: { message: 'Status is required' } });
        return;
      }

      const updated = await prisma.proDocument.update({
        where: {
          id: req.params.documentId,
        },
        data: {
          status,
          ...(status === 'REJECTED' && rejectionReason !== undefined && { rejectionReason }),
          ...(status === 'APPROVED' && { rejectionReason: null, reviewedAt: new Date() }),
          ...(status === 'PENDING' && { rejectionReason: null, reviewedAt: null }),
        },
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  // Jobs / bookings ledger. Kept in its own module: filtering, cursor paging
  // and the detail joins are more than this composition root should hold.
  router.use('/jobs', createAdminJobsRouter({ prisma: deps.prisma, storage: services.storage }));
  router.use('/live', createAdminLiveRouter({ prisma: deps.prisma }));

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

  // Services
  router.get('/services', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const services = await prisma.service.findMany({
        include: { skills: true },
        orderBy: { sortOrder: 'asc' },
      });
      res.json({ data: services });
    } catch (error) {
      next(error);
    }
  });

  router.post('/services', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { name, slug, icon, sortOrder, isActive } = req.body;

      const service = await prisma.service.create({
        data: {
          name,
          slug,
          icon,
          sortOrder: sortOrder ? Number(sortOrder) : 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });
      res.json({ data: service });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/services/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { name, slug, icon, sortOrder, isActive } = req.body;

      const service = await prisma.service.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(icon !== undefined && { icon }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });
      res.json({ data: service });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/services/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      await prisma.service.delete({
        where: { id: req.params.id },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/services/:serviceId/skills', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { name, slug, icon, sortOrder, isActive } = req.body;

      const skill = await prisma.skill.create({
        data: {
          serviceId: req.params.serviceId,
          name,
          slug,
          icon,
          sortOrder: sortOrder ? Number(sortOrder) : 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });
      res.json({ data: skill });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/skills/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { name, slug, icon, sortOrder, isActive } = req.body;

      const skill = await prisma.skill.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(icon !== undefined && { icon }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });
      res.json({ data: skill });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/skills/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      await prisma.skill.delete({
        where: { id: req.params.id },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Popular skills (curated home screen items)
  router.get('/popular-skills', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const items = await prisma.popularSkill.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          skill: {
            include: {
              service: true,
            },
          },
        },
      });
      res.json({ data: items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/popular-skills', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { skillId, sortOrder, isActive, isTopPick } = req.body;

      if (!skillId) {
        res.status(400).json({ error: { message: 'skillId is required' } });
        return;
      }

      const item = await prisma.popularSkill.create({
        data: {
          skillId,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          isTopPick: isTopPick !== undefined ? Boolean(isTopPick) : false,
        },
        include: {
          skill: {
            include: {
              service: true,
            },
          },
        },
      });
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/popular-skills/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { sortOrder, isActive, isTopPick } = req.body;

      const item = await prisma.popularSkill.update({
        where: { id: req.params.id },
        data: {
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          ...(isTopPick !== undefined && { isTopPick: Boolean(isTopPick) }),
        },
        include: {
          skill: {
            include: {
              service: true,
            },
          },
        },
      });
      res.json({ data: item });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/popular-skills/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      await prisma.popularSkill.delete({
        where: { id: req.params.id },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Banners
  router.get('/banners', async (_req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const banners = await prisma.banner.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      res.json({ data: banners });
    } catch (error) {
      next(error);
    }
  });

  router.post('/banners', validate(createBannerSchema), async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const banner = await prisma.banner.create({
        data: {
          key: req.body.key,
          heading: req.body.heading,
          subtitle: req.body.subtitle,
          ctaLabel: req.body.ctaLabel,
          serviceSlug: req.body.serviceSlug ?? null,
          image: req.body.image,
          imageDescription: req.body.imageDescription,
          sortOrder: req.body.sortOrder ?? 0,
          isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
        },
      });
      res.json({ data: banner });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/banners/:id', validate(updateBannerSchema), async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      const { key, heading, subtitle, ctaLabel, serviceSlug, image, imageDescription, sortOrder, isActive } = req.body;

      const banner = await prisma.banner.update({
        where: { id: req.params.id },
        data: {
          ...(key !== undefined && { key }),
          ...(heading !== undefined && { heading }),
          ...(subtitle !== undefined && { subtitle }),
          ...(ctaLabel !== undefined && { ctaLabel }),
          ...(serviceSlug !== undefined && { serviceSlug }),
          ...(image !== undefined && { image }),
          ...(imageDescription !== undefined && { imageDescription }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });
      res.json({ data: banner });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/banners/:id', async (req, res, next) => {
    try {
      if (!prisma) {
        res.status(503).json({ error: { message: 'Database unavailable' } });
        return;
      }

      await prisma.banner.delete({
        where: { id: req.params.id },
      });
      res.json({ success: true });
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
