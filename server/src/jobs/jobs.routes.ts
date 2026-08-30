import { Router } from 'express';
import {
  createServiceRequestSchema,
  selectProSchema,
  cancelRequestSchema,
  customerRequestsQuerySchema,
} from '@samona/validation';
import type { ServiceRequestStatus } from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate, routeParamId } from '../common';

/**
 * HTTP surface for the customer-facing order lifecycle, mounted at
 * `/service-requests`.
 *
 * The customer's side of the jobs domain: file a request, watch it find
 * professionals, pick one, cancel when things change. The pro side lives on
 * the pros router (`/pros/jobs`, `/pros/job-offers`, `/pros/available-jobs`).
 *
 * The user id always comes from the verified token, never from the body or
 * path, so there is no way to act on someone else's request (CLAUDE.md
 * "Security").
 */
export function createJobsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's request history, newest first. */
  router.get('/', validate(customerRequestsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as { status?: string; limit?: number; offset?: number };
      res.json(
        await services.jobs.listForCustomer(req.user!.id, {
          status: query.status as ServiceRequestStatus | undefined,
          limit: query.limit,
          offset: query.offset,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /** Files a new request; the backend decides dispatch vs open. */
  router.post('/', validate(createServiceRequestSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.jobs.createServiceRequest(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** One request, including the live shortlist of responding pros. */
  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await services.jobs.getForCustomer(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /** The shortlist alone — top of the choosing screen. */
  router.get('/:id/pros', async (req, res, next) => {
    try {
      const request = await services.jobs.getForCustomer(req.user!.id, routeParamId(req.params.id));
      res.json(request.respondingPros);
    } catch (error) {
      next(error);
    }
  });

  /** Atomically assigns the request to one professional. */
  router.post('/:id/select-pro', validate(selectProSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.selectPro(req.user!.id, routeParamId(req.params.id), req.body));
    } catch (error) {
      next(error);
    }
  });

  /** Cancels while the request is still cancellable. */
  router.post('/:id/cancel', validate(cancelRequestSchema), async (req, res, next) => {
    try {
      res.json(await services.jobs.cancelServiceRequest(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}