import { Router } from 'express';
import {
  registerPushTokenSchema,
  pushSettingsSchema,
  notificationListQuerySchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, routeParamId, validate } from '../common';

/**
 * HTTP surface for the notifications domain, mounted at `/notifications`.
 *
 * Every route is scoped to the caller's own profile: the user id comes from the
 * verified token, never from the path or body (CLAUDE.md "Security"). The push
 * token a user registers is their own device token — both pros and customers
 * do this so push reaches them wherever they are. The job-alert preference only
 * exists for pros, so `settings` stays pro-scoped while `register-token` is
 * open to either surface.
 *
 * Notification *history* is split by surface. Pros read their push history;
 * customers read their in-app notices, which the jobs domain records at each
 * booking transition. The `/notifications` list and the two customer-only
 * routes below therefore accept either role and dispatch on the caller's own
 * app type.
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
        // Which surface is registering — the caller's own `X-App-Type`. Never a
        // body value, and never inferred from which profiles exist.
        req.user!.appType,
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

  /** The caller's own notification history, newest first. */
  router.get(
    '/',
    requireRole('PRO', 'CUSTOMER', 'ADMIN'),
    validate(notificationListQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        // `validate(..., 'query')` replaces req.query with the coerced value.
        const { limit, cursor } = req.query as unknown as {
          limit: number;
          cursor?: string;
        };
        res.json(
          req.user!.appType === 'pro'
            ? await services.notifications.listForPro(req.user!.id, { limit, cursor })
            : await services.notifications.listForCustomer(req.user!.id, { limit, cursor }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /** How many of the customer's notices are still unread (bell pill count). */
  router.get('/unread-count', requireRole('CUSTOMER', 'ADMIN'), async (req, res, next) => {
    try {
      res.json({ unreadCount: await services.notifications.countUnreadForCustomer(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Marks every one of the customer's notices as read. Opening the
   * Notifications screen calls this once, so the bell pill resets without
   * the customer having to open each row. Idempotent. Scoped entirely to the
   * caller's own profile.
   *
   * Declared before `/:notificationId/read` so the literal path is never
   * captured as a notification id.
   */
  router.post('/read-all', requireRole('CUSTOMER', 'ADMIN'), async (req, res, next) => {
    try {
      await services.notifications.markAllCustomerNotificationsRead(req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /**
   * Acknowledges one of the customer's notices as read. Idempotent: a second
   * tap is still a 204. The row is scoped to the caller's own profile in the
   * service, never trusted from the path.
   */
  router.post('/:notificationId/read', requireRole('CUSTOMER', 'ADMIN'), async (req, res, next) => {
    try {
      await services.notifications.markCustomerNotificationRead(
        req.user!.id,
        routeParamId(req.params.notificationId),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
