import type { Request, Response, NextFunction } from 'express';
import { bearerToken } from '../../auth/token';
import { unauthenticated, forbidden } from '../../common/errors';
import type { AdminAuthService } from '../auth/admin-auth.service';

/**
 * Requires an authenticated admin.
 *
 * The dashboard authenticates with the HttpOnly session cookie minted by
 * `/admin/auth/verify-otp`. A Supabase bearer token is also accepted (same
 * token shape as the customer/pro APIs) so tooling and non-browser clients can
 * call the admin API without a cookie jar — both paths resolve to the same
 * database-backed admin record.
 */
export function createRequireAdmin(adminAuth: AdminAuthService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cookieToken = req.cookies?.['admin_session'];
      const headerToken = (req.headers['x-admin-token'] as string) || bearerToken(req.get('authorization'));

      if (!cookieToken && !headerToken) {
        next(unauthenticated());
        return;
      }

      if (cookieToken) {
        const session = await adminAuth.validateSession(cookieToken);
        if (session) {
          (req as any).adminUser = session.adminUser;
          (req as any).adminSession = session;
          next();
          return;
        }
        // Fall through to the bearer path (if any) instead of failing outright:
        // an expired cookie must not shadow a valid token on the same request.
      }

      if (headerToken) {
        const result = await adminAuth.verifyAdminToken(headerToken);
        if (result) {
          const { profile } = result;
          (req as any).adminUser = {
            id: profile.adminUser.id,
            role: profile.adminUser.role,
            permissions: profile.adminUser.permissions ?? null,
            isActive: profile.adminUser.isActive,
            profile,
          };
          next();
          return;
        }
      }

      next(unauthenticated('Session expired or invalid'));
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const adminUser = (req as any).adminUser;
    if (!adminUser) {
      next(unauthenticated());
      return;
    }

    // Super admin has all permissions.
    if (adminUser.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const userPermissions = Array.isArray(adminUser.permissions) ? adminUser.permissions : [];
    const hasPermission = permissions.some((p) => userPermissions.includes(p));

    if (!hasPermission && permissions.length > 0) {
      next(forbidden('Insufficient permissions'));
      return;
    }

    next();
  };
}
