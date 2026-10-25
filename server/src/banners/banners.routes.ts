import { Router } from 'express';
import type { Services } from '../context';
import { createRequireAuth } from '../common';

export function createBannersRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.get('/', requireAuth, async (_req, res, next) => {
    try {
      res.json(await services.banners.listActive());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
