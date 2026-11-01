import { Router } from 'express';
import {
  nextIncompleteStep,
  nextIncompleteCustomerStep,
  type CustomerOnboardingStep,
  type CustomerProfile,
  type OnboardingStatus,
  type OnboardingStep,
  type ProProfile,
  type PublicUser,
} from '@samona/types';
import type { Services } from '../context';
import { createRequireAuth } from '../common';
import { roleForAppType, type LocalUser } from './auth.service';

/**
 * Everything the app needs after sign-in, in one response.
 *
 * `nextStep` is computed from the profile's own data, so resuming onboarding
 * and entering the app are the same decision made in one place. Which profile
 * is returned (pro vs customer) is driven by the surface the caller is on —
 * the `X-App-Type` the client sent.
 */
export interface ProSessionResponse {
  user: PublicUser;
  proProfile: ProProfile;
  onboardingStatus: OnboardingStatus;
  nextStep: OnboardingStep;
}

export interface CustomerSessionResponse {
  user: PublicUser;
  customerProfile: CustomerProfile;
  onboardingStatus: OnboardingStatus;
  nextStep: CustomerOnboardingStep | null;
}

/** Shapes a local user for the wire. Never exposes internal columns. */
function toPublicUser(user: LocalUser): PublicUser {
  return {
    id: user.id,
    role: roleForAppType(user.appType),
    isAdmin: user.isAdmin,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    createdAt: user.createdAt.toISOString(),
  };
}

/** The identity fields `/auth/me` needs, mapped from a Profile row. */
function profileToLocal(
  row: {
    id: string;
    isAdmin: boolean;
    phone: string | null;
    email: string | null;
    fullName: string | null;
    isActive: boolean;
    deletedAt: Date | null;
    createdAt: Date;
  },
  appType: LocalUser['appType'],
): LocalUser {
  return {
    id: row.id,
    isAdmin: row.isAdmin,
    phone: row.phone,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    appType,
  };
}

/**
 * HTTP surface for the auth domain, mounted at `/auth`.
 *
 * There is no sign-in, sign-up or OTP route: Supabase Auth performs phone
 * verification directly from the app, so no credential ever reaches this
 * server. What remains is resolving the verified identity to our user record.
 *
 * A single phone is one account that can be both a customer and a professional
 * (Rapido style). This `GET /auth/me` returns the profile for the surface the
 * caller is on: the Pro app gets the pro profile, the Customer app the customer
 * profile, each created lazily on first access.
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

      // The surface the caller is on decides which profile / routing to return.
      const appType = req.user!.appType;
      const publicUser = toPublicUser(profileToLocal(user, appType));

      if (req.user!.isAdmin || appType === 'customer') {
        const customerProfile = await services.customers.ensureForUser(req.user!.id);

        const body: CustomerSessionResponse = {
          user: publicUser,
          customerProfile,
          onboardingStatus: customerProfile.onboardingStatus,
          nextStep: nextIncompleteCustomerStep(customerProfile),
        };
        res.json(body);
        return;
      }

      const proProfile = await services.pros.ensureForUser(req.user!.id);

      const body: ProSessionResponse = {
        user: publicUser,
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
