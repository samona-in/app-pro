import { Router } from 'express';
import { proLocationUpdateSchema, trackingStatusSchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

export function createTrackingRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  // Pro posts location update (REST fallback)
  router.post(
    '/location',
    requireRole('PRO'),
    validate(proLocationUpdateSchema),
    async (req, res, next) => {
      try {
        const result = await services.tracking.updateLocation(req.user!.id, req.body);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // Pro sets tracking status
  router.post(
    '/status',
    requireRole('PRO'),
    validate(trackingStatusSchema),
    async (req, res, next) => {
      try {
        const result = await services.tracking.setTrackingStatus(req.user!.id, req.body);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // Get tracking status
  router.get('/:bookingId/status', async (req, res, next) => {
    try {
      const result = await services.tracking.getTrackingStatus(req.user!.id, req.params.bookingId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get latest location
  router.get('/:bookingId/location', async (req, res, next) => {
    try {
      const result = await services.tracking.getLatestLocation(req.user!.id, req.params.bookingId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
