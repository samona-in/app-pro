import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@samona/types';
import { forbidden, unauthenticated } from '../errors';

/** The authenticated principal, derived server-side from a verified token. */
export interface AuthenticatedUser {
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

/**
 * Rejects unauthenticated requests.
 *
 * Scaffold: token verification lands with the auth domain. Until then this
 * denies by default — the safe direction for a guard that is not yet wired.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthenticated());
    return;
  }
  next();
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
