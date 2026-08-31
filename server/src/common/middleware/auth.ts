import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@samona/types';
import type { AppType } from '@samona/config';
import type { AuthService } from '../../auth/auth.service';
import { bearerToken, type TokenVerifier } from '../../auth/token';
import { forbidden, unauthenticated } from '../errors';

/** The authenticated principal, derived server-side from a verified token. */
export interface AuthenticatedUser {
  /** Matches both our `Profile.id` and Supabase's `auth.users.id`. */
  id: string;
  /** Stored privilege, never read from a token. Grants admin-only routes. */
  isAdmin: boolean;
  /** Which surface this request is on, from the `X-App-Type` header. */
  appType: AppType | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface RequireAuthDeps {
  verifier: TokenVerifier;
  authService: AuthService;
}

/**
 * Rejects unauthenticated requests and attaches the local principal.
 *
 * The Supabase token is trusted for *identity* only. Privilege (`isAdmin`)
 * comes from our own database, never from a token claim — Supabase lets a
 * project write custom claims, and anything we do not issue ourselves is not a
 * basis for authorisation (CLAUDE.md "Authentication"). The `X-App-Type` header
 * selects which surface the request is on; it grants nothing an authenticated
 * user does not already have (every account can be both customer and pro).
 */
export function createRequireAuth({ verifier, authService }: RequireAuthDeps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req.get('authorization'));

    if (!token) {
      next(unauthenticated());
      return;
    }

    try {
      const verified = await verifier.verify(token);

      if (!verified) {
        next(unauthenticated('Your session has expired. Please sign in again.'));
        return;
      }

      // Creates the local row on first sign-in; a cheap lookup afterwards.
      const appType = req.get('x-app-type');
      const user = await authService.syncUser(verified, appType);

      if (!user.isActive) {
        next(forbidden('This account has been deactivated.'));
        return;
      }

      req.user = { id: user.id, isAdmin: user.isAdmin, appType: user.appType };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The surfaces a route can be restricted to, plus the stored admin privilege. */
type RoleRequirement = UserRole | 'ADMIN';

/**
 * Restricts a route to the given roles.
 *
 * A user is a CUSTOMER when they are on the customer surface (the Customer app
 * sent `X-App-Type: customer`) and a PRO when on the pro surface. `ADMIN` is a
 * stored privilege, not a surface: it is never read from a token or a client
 * payload, and it bypasses the surface check.
 */
export function requireRole(...roles: RoleRequirement[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { isAdmin, appType } = req.user ?? {};

    if (!req.user) {
      next(unauthenticated());
      return;
    }

    // A stored admin bypasses the surface check entirely.
    if (isAdmin) {
      next();
      return;
    }

    const surface = appType === 'customer' ? 'CUSTOMER' : appType === 'pro' ? 'PRO' : null;

    const allowed =
      surface !== null && roles.some((role) => role !== 'ADMIN' && role === surface);

    if (!allowed) {
      next(forbidden());
      return;
    }

    next();
  };
}
