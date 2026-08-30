import { Router } from 'express';
import { confirmPaymentSchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate, routeParamId } from '../common';

/**
 * HTTP surface for the payments domain, mounted at `/payments`.
 *
 * V1 surfaces one customer action — settle a completed job. The amount is
 * anchored server-side at completion; the customer only confirms the payment.
 */
export function createPaymentsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** Settles the completed request the caller owns. */
  router.post('/requests/:id/mark-paid', validate(confirmPaymentSchema), async (req, res, next) => {
    try {
      res.json(await services.payments.markPaid(req.user!.id, routeParamId(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}