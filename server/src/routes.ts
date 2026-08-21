import { Router } from 'express';
import type { Services } from './context';
import type { Limiters } from './common';

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
 *
 * Rate limiting is applied per domain here, on top of the global budget in
 * `app.ts`, so the tier is visible next to the routes it protects rather than
 * buried inside each handler.
 */
export function createApiRouter(services: Services, limiters: Limiters): Router {
  const router = Router();

  // Note: /health is mounted in app.ts, ahead of the Clerk middleware, so it
  // stays available regardless of auth configuration.

  // Credentials: the credential-stuffing and OTP brute-force surface.
  router.use('/auth', limiters.auth, createAuthRouter(services));

  // Profile and catalogue reads/writes.
  router.use('/users', limiters.write, createUsersRouter(services));
  router.use('/pros', limiters.write, createProsRouter(services));
  router.use('/customers', limiters.write, createCustomersRouter(services));
  router.use('/services', createServicesRouter(services));
  router.use('/jobs', limiters.write, createJobsRouter(services));
  router.use('/reviews', limiters.write, createReviewsRouter(services));
  router.use('/notifications', limiters.write, createNotificationsRouter(services));

  // High-frequency telemetry gets its own, larger budget.
  router.use('/locations', limiters.location, createLocationsRouter(services));

  // Money and third-party fan-out: the tightest budget, because abuse costs
  // real money rather than CPU.
  router.use('/payments', limiters.expensive, createPaymentsRouter(services));
  router.use('/earnings', limiters.expensive, createEarningsRouter(services));

  return router;
}
