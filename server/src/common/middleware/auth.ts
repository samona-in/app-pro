import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@samona/types';
import type { AuthService } from '../../auth/auth.service';
import { bearerToken, type TokenVerifier } from '../../auth/token';
import { forbidden, unauthenticated } from '../errors';

/** The authenticated principal, derived server-side from a verified token. */
export interface AuthenticatedUser {
  /** Matches both our `User.id` and Supabase's `auth.users.id`. */
  id: string;
  role: UserRole;
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
 * The Supabase token is trusted for *identity* only. The role comes from our
 * own database, never from a token claim — Supabase lets a project write custom
 * claims, and anything we do not issue ourselves is not a basis for
 * authorisation (CLAUDE.md "Authentication").
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
      // The X-App-Type header tells us which role to assign on provisioning.
      const appType = req.get('x-app-type');
      const user = await authService.syncUser(verified, appType);

      if (!user.isActive) {
        next(forbidden('This account has been deactivated.'));
        return;
      }

      req.user = { id: user.id, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Restricts a route to the given roles.
 *
 * The role is read from the authenticated principal, never from the request
 * body, a header or a query parameter (CLAUDE.md "Authentication").
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!role) {
      next(unauthenticated());
      return;
    }
    if (!roles.includes(role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
