import { Router } from 'express';
import { createJobSchema, paginationSchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * HTTP surface for the jobs domain, mounted at `/jobs`.
 *
 * Every route is scoped to the caller's own customer profile: the customer id
 * comes from the verified token, never from the path or body, and the state
 * machine is enforced in the service (CLAUDE.md "Job State Machine"). The
 * customer asks for a job to be created or read; it never asserts a status.
 */
export function createJobsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's own requests, newest first. */
  router.get('/', validate(paginationSchema, 'query'), async (req, res, next) => {
    try {
      const limit = typeof req.query.limit === 'number' ? req.query.limit : 20;
      res.json(await services.jobs.listForCustomer(req.user!.id, limit));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Places a job request.
   *
   * The body names the service and skill by slug; the server resolves them and
   * confirms the skill belongs to the service. Photos are verified to exist in
   * storage and to live under this customer's own scope before they are
   * recorded.
   */
  router.post('/', validate(createJobSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.jobs.createForCustomer(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** One of the caller's own requests. */
  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await services.jobs.getForCustomer(req.user!.id, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
