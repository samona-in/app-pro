import { Router } from 'express';
import {
  createJobSchema,
  paginationSchema,
  jobListQuerySchema,
  transitionJobSchema,
  cancelJobSchema,
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
 * - Customer/Admin: create, list own, read own, settle payment, cancel.
 * - Pro/Admin: list assigned, list open available, accept, on-site transition,
 *   cancel. The single `/pay` route is deliberately customer-scoped.
 */
export function createJobsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  const customer = Router();
  customer.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's own requests, newest first. */
  customer.get('/', validate(paginationSchema, 'query'), async (req, res, next) => {
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
  customer.post('/', validate(createJobSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.jobs.createForCustomer(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** One of the caller's own requests. */
  customer.get('/:id', async (req, res, next) => {
    try {
      res.json(await services.jobs.getForCustomer(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Settles a completed job: PAYMENT_PENDING → PAID. Exactly once, in the
   * service; the price was anchored server-side when the job was completed.
   */
  customer.post('/:id/pay', async (req, res, next) => {
    try {
      res.json(await services.jobs.payForCustomer(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  const pro = Router();
  pro.use(requireAuth, requireRole('PRO', 'ADMIN'));

  /** The caller's own confirmed and in-flight jobs, newest first. */
  pro.get('/mine', validate(jobListQuerySchema, 'query'), async (req, res, next) => {
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
  pro.get('/available', validate(paginationSchema, 'query'), async (req, res, next) => {
    try {
      const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
      res.json(await services.jobs.listAvailableJobs(req.user!.id, { limit }));
    } catch (error) {
      next(error);
    }
  });

  /** Accepts an open job atomically. The first eligible pro to claim it wins. */
  pro.post('/:id/accept', async (req, res, next) => {
    try {
      res.json(await services.jobs.acceptJob(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /** One on-site stage of an accepted job, enforced by the state machine. */
  pro.post('/:id/transition', validate(transitionJobSchema), async (req, res, next) => {
    try {
      res.json(
        await services.jobs.transitionJob(
          req.user!.id,
          routeParamId(req.params.id),
          req.body.action,
          req.body.note,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.use(customer);
  router.use(pro);

  // A party to the job may cancel it until it leaves cancellation territory.
  // Registered last so `/mine` and `/available` always win the match.
  const either = Router();
  either.use(requireAuth, requireRole('CUSTOMER', 'PRO', 'ADMIN'));
  either.post('/:id/cancel', validate(cancelJobSchema), async (req, res, next) => {
    try {
      res.json(
        await services.jobs.cancelJob(req.user!.id, routeParamId(req.params.id), req.body.note),
      );
    } catch (error) {
      next(error);
    }
  });
  router.use(either);

  return router;
}
