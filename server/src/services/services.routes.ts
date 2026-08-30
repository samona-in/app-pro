import { Router } from 'express';
import type { Services } from '../context';
import { createRequireAuth } from '../common';

/**
 * HTTP surface for the services domain, mounted at `/services`.
 *
 * Any authenticated user may read the catalogue: customers pick a service to
 * request, and professionals pick theirs during onboarding. Role-specific
 * detail (skills for the pro) can be layered here later.
 */
export function createServicesRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await services.services.list());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
