import { Router } from 'express';
import type { Services } from './context';
import type { Limiters } from './common';
import type { PrismaClient } from './database/prisma';
import type { Redis } from './database/redis';

import { createHealthRouter } from './health/health.routes';
import { createAuthRouter } from './auth/auth.routes';
import { createUsersRouter } from './users/users.routes';
import { createProsRouter } from './pros/pros.routes';
import { createFilesRouter } from './files/files.routes';
import { createCustomersRouter } from './customers/customers.routes';
import { createServicesRouter } from './services/services.routes';
import { createBannersRouter } from './banners/banners.routes';
import { createJobsRouter } from './jobs/jobs.routes';
import { createMessagesRouter } from './messages/messages.routes';
import { createLocationsRouter } from './locations/locations.routes';
import { createAddressesRouter } from './addresses/addresses.routes';
import { createEarningsRouter } from './earnings/earnings.routes';
import { createNotificationsRouter } from './notifications/notifications.routes';
import { createReviewsRouter } from './reviews/reviews.routes';
import { createDocumentsRouter } from './documents/documents.routes';
import { createAdminRouter } from './admin';

export function createApiRouter(
  services: Services,
  limiters: Limiters,
  deps: { prisma?: PrismaClient; redis?: Redis | null } = {},
): Router {
  const router = Router();

  router.use('/health', createHealthRouter());
  router.use('/auth', createAuthRouter(services));
  router.use('/users', limiters.write, createUsersRouter(services, limiters));
  router.use('/pros', limiters.write, createProsRouter(services));
  router.use('/customers', limiters.write, createCustomersRouter(services));
  router.use('/services', createServicesRouter(services));
  router.use('/banners', createBannersRouter(services));
  router.use('/jobs', limiters.write, createJobsRouter(services));
  router.use('/reviews', limiters.write, createReviewsRouter(services));
  router.use('/notifications', limiters.write, createNotificationsRouter(services));
  router.use('/locations', limiters.location, createLocationsRouter(services));
  router.use('/addresses', limiters.write, createAddressesRouter(services));
  router.use('/messages', limiters.write, createMessagesRouter(services));
  router.use('/earnings', limiters.expensive, createEarningsRouter(services));
  router.use('/files', limiters.expensive, createFilesRouter(services));
  router.use('/documents', limiters.expensive, createDocumentsRouter(services));

  router.use(
    '/admin',
    createAdminRouter(services, {
      redis: deps.redis ?? null,
      prisma: deps.prisma ?? null,
    }),
  );

  return router;
}
