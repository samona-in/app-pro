import { Router } from 'express';
import type { PublicUser } from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth } from '../common';
import type { LocalUser } from './auth.service';

/** Shapes a local user for the wire. Never exposes internal columns. */
function toPublicUser(user: LocalUser): PublicUser {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * HTTP surface for the auth domain, mounted at `/auth`.
 *
 * There is no sign-in, sign-up or OTP route: Supabase Auth performs phone
 * verification directly from the app, so no credential ever reaches this
 * server. What remains is resolving the verified identity to our user record.
 */
export function createAuthRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  /**
   * The current user, provisioning the local record on first call.
   *
   * The app calls this once Supabase reports a session, which is what turns a
   * Supabase identity into a SAMONA user.
   */
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const user = await services.users.findById(req.user!.id);
      if (!user) {
        // requireAuth just provisioned it, so this means it was deleted mid-request.
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'This account no longer exists.' },
        });
        return;
      }
      res.json(toPublicUser(user as LocalUser));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
