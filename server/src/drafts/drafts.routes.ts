import { Router } from 'express';
import {
  z,
  saveBookingCartSchema,
  saveBookingDraftSchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * The body of a cart save.
 *
 * New clients send the whole multi-service cart (`groups`). Older builds send
 * one service (`serviceSlug` + `items`); it is normalized into a one-group cart
 * so the service only ever sees the grouped shape. An empty legacy `items`
 * list clears the cart, exactly like an empty `groups` list.
 */
const saveCartSchema = z.union([
  saveBookingCartSchema,
  saveBookingDraftSchema.transform((legacy) => ({
    description: legacy.description,
    imagePaths: legacy.imagePaths,
    groups:
      legacy.items.length > 0
        ? [{ serviceSlug: legacy.serviceSlug, items: legacy.items }]
        : [],
  })),
]);

/**
 * HTTP surface for saved booking carts, mounted at `/drafts`.
 *
 * A cart is the customer's own in-progress request, so every route is scoped to
 * the caller's profile: the user id comes from the verified token, never from
 * the path or body. There is one "current" cart per customer, which may span
 * several services — one ACTIVE draft row per service behind it.
 *
 * - GET    /drafts/current  → the active cart, or null.
 * - PUT    /drafts/current  → save/replace it (empty groups clears it).
 * - DELETE /drafts/current  → abandon it.
 */
export function createDraftsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's current cart, hydrated by the app on launch. */
  router.get('/current', async (req, res, next) => {
    try {
      res.json(await services.drafts.getCurrent(req.user!.id));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Saves the cart. The client sends only what the customer wants; every price
   * is recomputed from the catalogue. An empty `groups` list clears the cart and
   * responds with null.
   */
  router.put('/current', validate(saveCartSchema), async (req, res, next) => {
    try {
      res.json(await services.drafts.saveCurrent(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** Abandons the cart. Idempotent. */
  router.delete('/current', async (req, res, next) => {
    try {
      await services.drafts.clearCurrent(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
