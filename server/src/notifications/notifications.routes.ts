import { Router } from 'express';
import {
  registerPushTokenSchema,
  pushSettingsSchema,
  notificationListQuerySchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * HTTP surface for the notifications domain, mounted at `/notifications`.
 *
 * Every route is scoped to the caller's own profile: the user id comes from the
 * verified token, never from the path or body (CLAUDE.md "Security"). The push
 * token a user registers is their own device token — both pros and customers
 * do this so push reaches them wherever they are. The job-alert preference only
 * exists for pros, so `settings` stays pro-scoped while `register-token` is
 * open to either surface.
 */
export function createNotificationsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  /** Registers (or replaces) the caller's device push token. One app install. */
  router.post('/register-token', validate(registerPushTokenSchema), async (req, res, next) => {
    try {
      await services.notifications.registerPushToken(
        req.user!.id,
        req.body.pushToken,
        req.body.platform,
        req.body.provider,
        req.body.deviceId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /** Turns the caller's job alerts on or off (pro only). */
  router.patch(
    '/settings',
    requireRole('PRO', 'ADMIN'),
    validate(pushSettingsSchema),
    async (req, res, next) => {
      try {
        res.json(
          await services.notifications.setPushSettings(req.user!.id, req.body.jobAlertsEnabled),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /** The caller's own notification history, newest first (pro only). */
  router.get(
    '/',
    requireRole('PRO', 'ADMIN'),
    validate(notificationListQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        // `validate(..., 'query')` replaces req.query with the coerced value.
        const { limit, cursor } = req.query as unknown as {
          limit: number;
          cursor?: string;
        };
        res.json(await services.notifications.listForPro(req.user!.id, { limit, cursor }));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
