import { Router } from 'express';
import {
  onboardingPatchSchema,
  availabilityPatchSchema,
  proJobsQuerySchema,
  proOffersQuerySchema,
  availableJobsQuerySchema,
  acceptOfferSchema,
  declineOfferSchema,
  createProInterestSchema,
  jobTransitionSchema,
} from '@samona/validation';
import type { ServiceRequestStatus, JobOfferStatus } from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate, routeParamId } from '../common';

/**
 * HTTP surface for the pros domain, mounted at `/pros`.
 *
 * Every route is scoped to the caller's own profile: the user id comes from the
 * verified token, never from the path or body, so there is no route on which a
 * Pro can name someone else's profile (CLAUDE.md "Security").
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

  /** The caller's confirmed and in-flight jobs. */
  router.get('/jobs', validate(proJobsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as { status?: string; limit?: number };
      res.json(
        await services.jobs.listProJobs(req.user!.id, {
          status: query.status as ServiceRequestStatus | undefined,
          limit: query.limit,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /** Open requests the caller is eligible to serve. */
  router.get('/available-jobs', validate(availableJobsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as { serviceId?: string; limit?: number; offset?: number };
      res.json(
        await services.jobs.listAvailableJobs(req.user!.id, {
          serviceId: query.serviceId,
          limit: query.limit,
          offset: query.offset,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /** Instant dispatch offers for the caller, newest first. */
  router.get('/job-offers', validate(proOffersQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as { status?: string; limit?: number };
      res.json(
        await services.jobs.listProOffers(req.user!.id, {
          status: query.status as JobOfferStatus | undefined,
          limit: query.limit,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /** Accept or decline a dispatch offer. */
  router.post('/job-offers/:id/accept', validate(acceptOfferSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.respondToOffer(req.user!.id, routeParamId(req.params.id), 'accept'));
    } catch (error) {
      next(error);
    }
  });
  router.post('/job-offers/:id/decline', validate(declineOfferSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.respondToOffer(req.user!.id, routeParamId(req.params.id), 'decline'));
    } catch (error) {
      next(error);
    }
  });

  /** Express interest in an open request. */
  router.post('/pro-interests', validate(createProInterestSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.createProInterest(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** On-site job stages, driven by the assigned pro. */
  router.post('/jobs/:id/arrived', validate(jobTransitionSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.transitionJob(req.user!.id, routeParamId(req.params.id), 'arrived', req.body.note));
    } catch (error) {
      next(error);
    }
  });
  router.post('/jobs/:id/start', validate(jobTransitionSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.transitionJob(req.user!.id, routeParamId(req.params.id), 'start', req.body.note));
    } catch (error) {
      next(error);
    }
  });
  router.post('/jobs/:id/complete', validate(jobTransitionSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.transitionJob(req.user!.id, routeParamId(req.params.id), 'complete', req.body.note));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
