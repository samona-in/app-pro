import { Router } from 'express';
import type { PublicUser } from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth } from '../common';
import type { LocalUser } from './auth.service';

/** Shapes a local user for the wire. Never exposes internal columns. */
function toPublicUser(user: LocalUser, createdAt: Date): PublicUser {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    createdAt: createdAt.toISOString(),
  };
}

/**
 * HTTP surface for the auth domain, mounted at `/auth`.
 *
 * There is no sign-in, sign-up or OTP route: Clerk performs phone verification
 * directly from the app, so no credential ever reaches this server. What
 * remains is resolving the verified identity to our own user record.
 *
 * The webhook is mounted separately in `app.ts` because its signature must be
 * checked against the raw body, before any JSON parsing.
 */
export function createAuthRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth(services.auth);

  /**
   * The current user, provisioning the local record on first call.
   *
   * The app calls this immediately after Clerk reports a session, which is what
   * turns a Clerk identity into a SAMONA user.
   */
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      // requireAuth guarantees req.user; re-read for the full record.
      const user = await services.auth.syncUser(req.user!.clerkUserId);
      const record = await services.users.findById(user.id);

      res.json(toPublicUser(user, record?.createdAt ?? new Date()));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
