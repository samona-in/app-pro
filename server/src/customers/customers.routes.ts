import { Router } from 'express';
import { customerOnboardingPatchSchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * HTTP surface for the customers domain, mounted at `/customers`.
 *
 * Every route is scoped to the caller's own profile: the user id comes from the
 * verified token, never from the path or body.
 */
export function createCustomersRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's own customer profile, created empty on first access. */
  router.get('/me', async (req, res, next) => {
    try {
      res.json(await services.customers.ensureForUser(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Saves one onboarding step.
   *
   * A partial update by design, so progress survives the customer closing the
   * app mid-flow. `onboardingStatus` is recomputed server-side from the
   * resulting data and is deliberately not accepted from the client.
   */
  router.patch(
    '/me/onboarding',
    validate(customerOnboardingPatchSchema),
    async (req, res, next) => {
      try {
        res.json(await services.customers.applyOnboardingPatch(req.user!.id, req.body));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
