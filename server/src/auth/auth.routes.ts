import { Router } from 'express';
import {
  nextIncompleteStep,
  type OnboardingStatus,
  type OnboardingStep,
  type ProProfile,
  type PublicUser,
} from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth } from '../common';
import type { LocalUser } from './auth.service';

/**
 * Everything the app needs after sign-in, in one response.
 *
 * `nextStep` is computed from the profile's own data, so resuming onboarding
 * and entering the app are the same decision made in one place.
 */
export interface SessionResponse {
  user: PublicUser;
  proProfile: ProProfile;
  onboardingStatus: OnboardingStatus;
  nextStep: OnboardingStep;
}

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
   * The current user, plus everything the app needs to decide where to send
   * them.
   *
   * Returning the routing decision here rather than making the app assemble it
   * from several calls means there is one answer, computed server-side, and no
   * window where the client routes on half-loaded data.
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

      const proProfile = await services.pros.ensureForUser(req.user!.id);

      const body: SessionResponse = {
        user: toPublicUser(user as LocalUser),
        proProfile,
        onboardingStatus: proProfile.onboardingStatus,
        nextStep: nextIncompleteStep(proProfile),
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
