import { Router } from 'express';
import type { Services } from './context';
import type { Limiters } from './common';

import { createHealthRouter } from './health/health.routes';
import { createAuthRouter } from './auth/auth.routes';
import { createUsersRouter } from './users/users.routes';
import { createProsRouter } from './pros/pros.routes';
import { createFilesRouter } from './files/files.routes';
import { createCustomersRouter } from './customers/customers.routes';
import { createServicesRouter } from './services/services.routes';
import { createJobsRouter } from './jobs/jobs.routes';
import { createMessagesRouter } from './messages/messages.routes';
import { createLocationsRouter } from './locations/locations.routes';
import { createAddressesRouter } from './addresses/addresses.routes';
import { createEarningsRouter } from './earnings/earnings.routes';
import { createNotificationsRouter } from './notifications/notifications.routes';
import { createReviewsRouter } from './reviews/reviews.routes';
import { createDocumentsRouter } from './documents/documents.routes';

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

  // Unlimited by design: load balancers poll this, and a limited health check
  // reports unhealthy under exactly the load it exists to survive.
  router.use('/health', createHealthRouter());

  // No credential endpoints exist: Supabase Auth owns sign-in and OTP, so the
  // `auth` tier stays reserved for them. `/auth/me` is session validation — a
  // high-frequency read every app boot depends on. Putting it behind the
  // failures-only credential budget meant one database outage locked every
  // signed-in user out for 15 minutes; it rides the global baseline instead.
  router.use('/auth', createAuthRouter(services));

  // Profile and catalogue reads/writes. `/users` also hosts the destructive
  // deletion routes; they self-limit (the authorization mint rides the auth
  // tier) and the write tier here confines confirm storms.
  router.use('/users', limiters.write, createUsersRouter(services, limiters));
  router.use('/pros', limiters.write, createProsRouter(services));
  router.use('/customers', limiters.write, createCustomersRouter(services));
  router.use('/services', createServicesRouter(services));
  // The whole order lifecycle: customers file jobs, pros take them on, and
  // settlement lands on the same entity. Roles are gated per-route.
  router.use('/jobs', limiters.write, createJobsRouter(services));
  router.use('/reviews', limiters.write, createReviewsRouter(services));
  router.use('/notifications', limiters.write, createNotificationsRouter(services));

  // High-frequency telemetry gets its own, larger budget.
  router.use('/locations', limiters.location, createLocationsRouter(services));

  // Customer-owned saved addresses: labelled Home/Work/Other places reused at
  // booking time. Write-tier like the customer profile it belongs to.
  router.use('/addresses', limiters.write, createAddressesRouter(services));

  // Job-scoped chat. Rides the write limiter like jobs; the auth middleware is
  // per-route inside the router rather than baked into the sub-router so the
  // caller is validated but no role is enforced (either party may talk).
  router.use('/messages', limiters.write, createMessagesRouter(services));

  // Money and third-party fan-out: the tightest budget, because abuse costs
  // real money rather than CPU. Job payment settles on the jobs router.
  router.use('/earnings', limiters.expensive, createEarningsRouter(services));

  // Signed upload URLs hand out write access to object storage — the same
  // "costs money if abused" tier as payments and geocoding.
  router.use('/files', limiters.expensive, createFilesRouter(services));

  // Same rationale as /files: this router mints presigned PUTs and GETs for
  // the private documents bucket. One tier for the whole router keeps the
  // list/read routes under the same budget rather than splitting the mount.
  router.use('/documents', limiters.expensive, createDocumentsRouter(services));

  return router;
}
