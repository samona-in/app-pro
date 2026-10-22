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

  /**
   * Catalogue search across service names and skill names.
   *
   * Registered before `/:slug/skills` so Express does not mistake "search"
   * for a slug. Returns an empty result for a blank or missing `q`.
   */
  router.get('/search', requireAuth, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        res.json({ services: [], skills: [] });
        return;
      }
      res.json(await services.services.searchServices(q));
    } catch (error) {
      next(error);
    }
  });

  /**
   * The skills promoted on the customer home screen.
   *
   * Registered before `/:slug/skills` so Express does not mistake
   * "popular-skills" for a slug.
   */
  router.get('/popular-skills', requireAuth, async (_req, res, next) => {
    try {
      res.json(await services.services.listPopularSkills());
    } catch (error) {
      next(error);
    }
  });

  /**
   * The exact-need categories for one service (the booking flow's "what
   * exactly" step). An unknown slug simply returns an empty list rather than
   * leaking catalogue ids.
   */
  router.get('/:slug/skills', requireAuth, async (req, res, next) => {
    try {
      const slug = req.params.slug;
      if (typeof slug !== 'string') {
        res.json([]);
        return;
      }
      res.json(await services.services.listSkillsForService(slug));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
