import { Router } from 'express';
import { savedAddressCreateSchema, savedAddressUpdateSchema } from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, routeParamId, validate } from '../common';

/**
 * HTTP surface for the addresses domain, mounted at `/addresses`.
 *
 * Saved addresses are customer-owned. Every route is scoped to the caller's
 * own profile: the user id comes from the verified token, never from the path
 * or body, and each `:id` is only ever matched together with that user id
 * (CLAUDE.md "Security"). Mounted under the `write` limiter in `routes.ts`.
 */
export function createAddressesRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('CUSTOMER', 'ADMIN'));

  /** The caller's saved addresses, default first, then most recently edited. */
  router.get('/', async (req, res, next) => {
    try {
      res.json({ data: await services.addresses.listForUser(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  /** Saves a new labelled address. The first one becomes the default. */
  router.post('/', validate(savedAddressCreateSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.addresses.create(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** Edits one of the caller's saved addresses, e.g. to set it as the default. */
  router.patch(
    '/:addressId',
    validate(savedAddressUpdateSchema),
    async (req, res, next) => {
      try {
        res.json(
          await services.addresses.update(
            req.user!.id,
            routeParamId(req.params.addressId),
            req.body,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /** Deletes one of the caller's saved addresses. Idempotent. */
  router.delete('/:addressId', async (req, res, next) => {
    try {
      await services.addresses.remove(
        req.user!.id,
        routeParamId(req.params.addressId),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}