import { Router } from 'express';
import { addressSearchQuerySchema, reverseGeocodeQuerySchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, validate } from '../common';

/**
 * HTTP surface for the locations domain, mounted at `/locations`.
 *
 * Exposes the replaceable OSM geocoder through our own proxy so the apps never
 * call a third party directly and the provider can be swapped server-side
 * without an app release. Any authenticated user may geocode — search feeds
 * the customer address picker today, and a pro's service-area flow may use the
 * same endpoints tomorrow.
 *
 * Mounted under the `location` limiter in `routes.ts` (high-frequency tier):
 * every keystroke in the address search is a candidate request. Validation is
 * shared with the client (`@samona/validation`) and runs before anything else
 * (CLAUDE.md "Security").
 */
export function createLocationsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  /** Forward-geocodes a free-text query into structured places. */
  router.get(
    '/search',
    validate(addressSearchQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const { q, limit } = req.query as unknown as { q: string; limit: number };
        res.json({ data: await services.locations.searchAddresses(q, limit) });
      } catch (error) {
        next(error);
      }
    },
  );

  /** Reverse-geocodes a coordinate into the place that covers it. */
  router.get(
    '/reverse',
    validate(reverseGeocodeQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const { latitude, longitude } = req.query as unknown as {
          latitude: number;
          longitude: number;
        };
        res.json({ data: await services.locations.reverseGeocode(latitude, longitude) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}