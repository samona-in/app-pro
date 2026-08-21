import { getAuth } from '@clerk/express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@samona/types';
import type { AuthService } from '../../auth/auth.service';
import { forbidden, unauthenticated } from '../errors';

/** The authenticated principal, derived server-side from a verified token. */
export interface AuthenticatedUser {
  /** Our user id, not Clerk's. Domain records reference this. */
  id: string;
  clerkUserId: string;
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

/**
 * Rejects unauthenticated requests and attaches the local principal.
 *
 * `clerkMiddleware` has already verified the token signature and expiry by the
 * time this runs; `getAuth` only reads that verified result. The session token
 * is trusted for *identity* only — the role comes from our own database, never
 * from a token claim, so a compromised or stale claim cannot escalate
 * privileges (CLAUDE.md "Authentication").
 */
export function createRequireAuth(authService: AuthService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const { userId } = getAuth(req);

    if (!userId) {
      next(unauthenticated());
      return;
    }

    try {
      // Creates the local row on first sign-in; a cheap lookup afterwards.
      const user = await authService.syncUser(userId);

      if (!user.isActive) {
        next(forbidden('This account has been deactivated.'));
        return;
      }

      req.user = { id: user.id, clerkUserId: user.clerkUserId, role: user.role };
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
