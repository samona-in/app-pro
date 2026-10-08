import { Router } from 'express';
import {
  onboardingPatchSchema,
  availabilityPatchSchema,
  serviceIdParamsSchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate, routeParamId } from '../common';

/**
 * HTTP surface for the pros domain, mounted at `/pros`.
 *
 * Every route is scoped to the caller's own profile: the user id comes from the
 * verified token, never from the path or body, so there is no route on which a
 * Pro can name someone else's profile (CLAUDE.md "Security").
 *
 * Job work lives on the jobs router (`/jobs/mine`, `/jobs/available`,
 * `/jobs/:id/accept` ...) now that the marketplace is a single job entity; the
 * pros router keeps profile, onboarding and availability only.
 */
export function createProsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('PRO', 'ADMIN'));

  /** The service and specialty catalogue for onboarding steps 3 and 4. */
  router.get('/catalogue', async (_req, res, next) => {
    try {
      res.json(await services.pros.listCatalogue());
    } catch (error) {
      next(error);
    }
  });

  /** The caller's own professional profile, created empty on first access. */
  router.get('/me', async (req, res, next) => {
    try {
      res.json(await services.pros.ensureForUser(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Saves one onboarding step.
   *
   * A partial update by design, so progress survives the Pro closing the app
   * mid-flow. `onboardingStatus` is recomputed server-side from the resulting
   * data and is deliberately not accepted from the client.
   */
  router.patch('/me/onboarding', validate(onboardingPatchSchema), async (req, res, next) => {
    try {
      res.json(await services.pros.applyOnboardingPatch(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** The online/offline switch that gates matching. */
  router.post('/availability', validate(availabilityPatchSchema), async (req, res, next) => {
    try {
      res.json(await services.pros.setAvailability(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Every active service with the caller's own verification status — the
   * Manage Services screen. `status: null` marks a service never requested.
   */
  router.get('/services', async (req, res, next) => {
    try {
      res.json(await services.pros.listProServices(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Requests verification for one service (or re-requests after rejection).
   *
   * The pro id comes from the token; the service id is validated as a UUID so
   * a malformed one fails here as a 422 rather than inside Prisma as a 500.
   * The only transition this can cause is → PENDING: ACCEPTED is admin-only.
   */
  router.post(
    '/services/:serviceId/request',
    validate(serviceIdParamsSchema, 'params'),
    async (req, res, next) => {
      try {
        res.json(
          await services.pros.requestProService(req.user!.id, routeParamId(req.params.serviceId)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
