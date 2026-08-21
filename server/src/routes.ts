import { Router } from 'express';
import type { Services } from './context';

import { createHealthRouter } from './health/health.routes';
import { createAuthRouter } from './auth/auth.routes';
import { createUsersRouter } from './users/users.routes';
import { createProsRouter } from './pros/pros.routes';
import { createCustomersRouter } from './customers/customers.routes';
import { createServicesRouter } from './services/services.routes';
import { createJobsRouter } from './jobs/jobs.routes';
import { createLocationsRouter } from './locations/locations.routes';
import { createPaymentsRouter } from './payments/payments.routes';
import { createEarningsRouter } from './earnings/earnings.routes';
import { createNotificationsRouter } from './notifications/notifications.routes';
import { createReviewsRouter } from './reviews/reviews.routes';

/**
 * Mounts every domain router under the API prefix.
 *
 * Routers are organised by business domain, not by technical layer — there is
 * no global `controllers/` folder (CLAUDE.md "Architecture"). The same API
 * serves the Pro app today and the Customer and Admin surfaces later, so
 * nothing here is Pro-specific.
 *
 * `matching` has no router by design: it is an internal domain service that
 * `jobs` drives.
 */
export function createApiRouter(services: Services): Router {
  const router = Router();

  router.use('/health', createHealthRouter());

  router.use('/auth', createAuthRouter(services));
  router.use('/users', createUsersRouter(services));
  router.use('/pros', createProsRouter(services));
  router.use('/customers', createCustomersRouter(services));
  router.use('/services', createServicesRouter(services));
  router.use('/jobs', createJobsRouter(services));
  router.use('/locations', createLocationsRouter(services));
  router.use('/payments', createPaymentsRouter(services));
  router.use('/earnings', createEarningsRouter(services));
  router.use('/notifications', createNotificationsRouter(services));
  router.use('/reviews', createReviewsRouter(services));

  return router;
}
