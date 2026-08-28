import { Router } from 'express';
import type { Services } from '../context';
import { createRequireAuth } from '../common';

/**
 * HTTP surface for the services domain, mounted at `/services`.
 *
 * The service catalogue is the one piece of marketplace data both sides need,
 * so these routes are open to any authenticated caller — customer or pro.
 * Reads only; the catalogue itself is seeded, not written by clients
 * (CLAUDE.md "Security", "Validation").
 */
export function createServicesRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  /** The active service categories for browsing, in display order. */
  router.get('/', requireAuth, async (_req, res, next) => {
    try {
      res.json(await services.services.listActive());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
