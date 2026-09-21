import { Router } from 'express';
import {
  createJobSchema,
  paginationSchema,
  jobListQuerySchema,
  transitionJobSchema,
  verifyStartSchema,
  cancelJobSchema,
  acceptJobOfferSchema,
  rejectJobOfferSchema,
} from '@samona/validation';
import type { JobStatus } from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate, routeParamId } from '../common';

/**
 * HTTP surface for the jobs domain, mounted at `/jobs`.
 *
 * Customers and pros live on the same entity, so both surfaces are here: the
 * caller's own profile comes from the verified token, never from the path or
 * body (CLAUDE.md "Security"), and the state machine is enforced in the
 * service — no route asserts a status (CLAUDE.md "Job State Machine").
 *
 * Payments are cash-only today — the customer never taps "pay", and PRO/Admin
 * alone can settle a completed job by confirming the cash was collected.
 *
 * - Customer/Admin: create, list own, read own, cancel.
 * - Pro/Admin: list assigned, list open available, accept, on-site transition,
 *   collect cash, cancel.
 */
export function createJobsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });
  const customerOnly = requireRole('CUSTOMER', 'ADMIN');
  const proOnly = requireRole('PRO', 'ADMIN');

  const customer = Router();
  customer.use(requireAuth);

  /**
   * Native overlay offer redemption — deliberately unauthenticated.
   *
   * These are the two endpoints the Android job-alert overlay calls directly
   * when the app process is dead, so there is no JWT to send. The credential is
   * the signed, single-use `offerToken` delivered inside the push itself: the
   * service verifies the HMAC, the expiry and the device binding, then consumes
   * the `job_offers` ledger row atomically before acting. The `write` limiter
   * mounted on `/jobs` in `routes.ts` still bounds this surface, keyed by IP
   * for these anonymous calls. Must be mounted before the authenticated
   * routers, whose `requireAuth` middleware would otherwise 401 it.
   */
  const offers = Router();
  offers.post(
    '/:jobId/offers/accept',
    validate(acceptJobOfferSchema),
    async (req, res, next) => {
      try {
        res.json(
          await services.jobs.acceptJobWithOffer(
            req.body.offerToken,
            req.body.deviceId,
            routeParamId(req.params.jobId),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  offers.post(
    '/:jobId/offers/reject',
    validate(rejectJobOfferSchema),
    async (req, res, next) => {
      try {
        await services.jobs.rejectJobOffer(
          req.body.offerToken,
          req.body.deviceId,
          routeParamId(req.params.jobId),
        );
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  /** The caller's own requests, newest first. */
  customer.get('/', customerOnly, validate(paginationSchema, 'query'), async (req, res, next) => {
    try {
      const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
      res.json(await services.jobs.listForCustomer(req.user!.id, limit));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Places a job request (the booking flow's final step).
   *
   * The service and skill are named by slug; the server resolves them and
   * confirms the skill belongs to the service. Photos are verified to exist in
   * storage and to live under this customer's own scope before they are
   * recorded.
   */
  customer.post('/', customerOnly, validate(createJobSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.jobs.createForCustomer(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  const pro = Router();
  pro.use(requireAuth);

  /** The caller's own confirmed and in-flight jobs, newest first. */
  pro.get('/mine', proOnly, validate(jobListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as { status?: string; limit?: number };
      res.json(
        await services.jobs.listProJobs(req.user!.id, {
          status: query.status as JobStatus | undefined,
          limit: query.limit,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /**
   * Open (REQUESTED, unassigned) jobs the caller serves, distance-ordered.
   * Realtime `job:new` nudges this feed; it stays the source of truth.
   */
  pro.get('/available', proOnly, validate(paginationSchema, 'query'), async (req, res, next) => {
    try {
      const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
      res.json(await services.jobs.listAvailableJobs(req.user!.id, { limit }));
    } catch (error) {
      next(error);
    }
  });

  /** Accepts an open job atomically. The first eligible pro to claim it wins. */
  pro.post('/:id/accept', proOnly, async (req, res, next) => {
    try {
      res.json(await services.jobs.acceptJob(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Records this pro's decline of an open request so it stops resurfacing for
   * them (scheduler, available feed, alert refetch). Idempotent; the job's own
   * status is never changed.
   */
  pro.post('/:id/decline', proOnly, async (req, res, next) => {
    try {
      await services.jobs.declineJob(req.user!.id, routeParamId(req.params.id));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /** One on-site stage of an accepted job, enforced by the state machine. */
  pro.post('/:id/transition', proOnly, validate(transitionJobSchema), async (req, res, next) => {
    try {
      res.json(
        await services.jobs.transitionJob(
          req.user!.id,
          routeParamId(req.params.id),
          req.body.action,
          req.body.note,
          req.body.coordinates,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  /**
   * The pro settles a completed job in cash on the doorstep: COMPLETED (or
   * PAYMENT_PENDING) → PAID. Payments are cash-only — this is the sole path to
   * PAID. The service walks two status steps and is idempotent once PAID.
   * Rides the shared `write` limiter mounted on `/jobs` in routes.ts.
   */
  pro.post('/:id/collect-cash', proOnly, async (req, res, next) => {
    try {
      res.json(await services.jobs.collectCashForPro(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Verifies the pro's start-work claim using the one-time code the customer
   * holds, advancing ARRIVED → IN_PROGRESS on success.
   *
   * The `/jobs` router rides the shared `write` limiter (routes.ts), and the
   * service pairs a code with a per-identity brute-force lockout keyed by the
   * job, so a wrong code cannot be sprayed even across many callers.
   */
  pro.post('/:id/verify', proOnly, validate(verifyStartSchema), async (req, res, next) => {
    try {
      res.json(
        await services.jobs.verifyStart(
          req.user!.id,
          routeParamId(req.params.id),
          req.body.code,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  // The offer endpoints are unauthenticated (token-authenticated in the
  // service) and must run before the authenticated routers.
  router.use(offers);

  // The pro router must win over the customer `/:id` catch-all: a literal
  // `/available` or `/mine` request from a pro must never be captured as a
  // customer `GET /jobs/:id`. The role guard for each group is applied per
  // route (not per router), so a CUSTOMER hitting `/jobs/available` is still
  // rejected by the pro route's own guard.
  router.use(pro);
  router.use(customer);

  /**
   * One request by id. Customers read their own placed request; a pro reads an
   * open, unassigned request their service serves — the fetch behind the
   * incoming-job alert (`fetchJob` in the app). Both actors share `GET /jobs/:id`,
   * so a single role-dispatching route here avoids the two routers' `/:id`
   * routes shadowing one another. 404s (pro) or 403s (customer) when the job
   * is not theirs / no longer open.
   */
  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      if (req.user!.appType === 'pro') {
        res.json(
          await services.jobs.getAvailableJobForPro(req.user!.id, routeParamId(req.params.id)),
        );
      } else {
        res.json(await services.jobs.getForCustomer(req.user!.id, routeParamId(req.params.id)));
      }
    } catch (error) {
      next(error);
    }
  });

  // A party to the job may cancel it until it leaves cancellation territory.
  // Registered last so `/mine`, `/available` and `/:id` always win the match.
  const cancelGuard = [
    requireAuth,
    requireRole('CUSTOMER', 'PRO', 'ADMIN'),
    validate(cancelJobSchema),
  ];
  router.post('/:id/cancel', ...cancelGuard, async (req, res, next) => {
    try {
      res.json(
        await services.jobs.cancelJob(req.user!.id, routeParamId(req.params.id), req.body.note),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
