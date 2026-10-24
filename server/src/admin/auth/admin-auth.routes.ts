import { Router } from 'express';
import type { Services } from '../../context';
import { bearerToken } from '../../auth/token';
import type { AdminAuthService } from './admin-auth.service';
import { createRequireAdmin } from '../middleware/require-admin';

/** Shapes the admin payload returned to the dashboard (never includes tokens). */
function adminPayload(profile: any) {
  return {
    id: profile.adminUser.id,
    role: profile.adminUser.role,
    permissions: profile.adminUser.permissions ?? null,
    profile: {
      id: profile.id,
      phone: profile.phone,
      fullName: profile.fullName,
      email: profile.email ?? null,
    },
  };
}

export function createAdminAuthRouter(services: Services, adminAuth: AdminAuthService): Router {
  const router = Router();
  const requireAdmin = createRequireAdmin(adminAuth);

  /**
   * Pre-flight check before the client asks Supabase to send an OTP.
   *
   * This endpoint does not send anything. It enforces the 3-strike lockout and
   * refuses to send codes to phone numbers that are not provisioned admins, so
   * Supabase never bills an SMS for a non-admin identity.
   */
  router.post('/request-otp', async (req, res, next) => {
    try {
      const { phone } = req.body ?? {};
      if (!phone || typeof phone !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Phone number required' } });
        return;
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const deviceId = (req.headers['x-device-id'] as string) || req.body?.deviceId;
      const identity = { phone, ip, deviceId };

      const allowed = await adminAuth.checkLoginAllowed(identity);
      if (!allowed.allowed) {
        res.setHeader('Retry-After', String(allowed.retryAfter ?? 3600));
        await adminAuth.logLoginEvent({
          phone,
          ipAddress: ip,
          deviceId,
          userAgent: req.get('user-agent'),
          success: false,
          failureReason: 'rate_limited',
          blocked: true,
          blockedUntil: new Date(Date.now() + (allowed.retryAfter ?? 3600) * 1000),
        });
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many failed attempts. Please try again later.' },
        });
        return;
      }

      const profile = await adminAuth.verifyAdminAccess(phone);
      if (!profile) {
        const failure = await adminAuth.recordFailedAttempt(identity);
        await adminAuth.logLoginEvent({
          phone,
          ipAddress: ip,
          deviceId,
          userAgent: req.get('user-agent'),
          success: false,
          failureReason: 'not_authorized',
          blocked: Boolean(failure),
          blockedUntil: failure ? new Date(Date.now() + failure.retryAfter * 1000) : undefined,
        });

        if (failure) {
          res.setHeader('Retry-After', String(failure.retryAfter));
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed attempts. Please try again later.',
            },
          });
          return;
        }

        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized' } });
        return;
      }

      res.json({ success: true, message: 'Proceed to send OTP' });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Exchanges a Supabase access token for an admin session cookie.
   *
   * The client verifies the OTP directly against Supabase (the same flow the
   * customer and pro apps use) and sends the resulting access token here. We
   * verify the token locally, then check the database for an active admin
   * record. OTP success alone never grants admin access.
   */
  router.post('/verify-otp', async (req, res, next) => {
    try {
      const { phone, accessToken, deviceId: bodyDeviceId } = req.body ?? {};
      const token = bearerToken(req.get('authorization')) || accessToken;

      if (!token) {
        res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Supabase access token required' },
        });
        return;
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const deviceId = (req.headers['x-device-id'] as string) || bodyDeviceId;
      // Before the token is verified we only have the claimed phone; use it
      // solely as a rate-limit bucket, never as identity.
      const claimedPhone = typeof phone === 'string' ? phone : 'unknown';

      const allowed = await adminAuth.checkLoginAllowed({
        phone: claimedPhone,
        ip,
        deviceId,
      });
      if (!allowed.allowed) {
        res.setHeader('Retry-After', String(allowed.retryAfter ?? 3600));
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many failed attempts. Please try again later.' },
        });
        return;
      }

      const result = await adminAuth.verifyAdminToken(token);
      if (!result) {
        const failure = await adminAuth.recordFailedAttempt({
          phone: claimedPhone,
          ip,
          deviceId,
        });
        await adminAuth.logLoginEvent({
          phone: claimedPhone,
          ipAddress: ip,
          deviceId,
          userAgent: req.get('user-agent'),
          success: false,
          failureReason: 'not_authorized',
          blocked: Boolean(failure),
          blockedUntil: failure ? new Date(Date.now() + failure.retryAfter * 1000) : undefined,
        });

        if (failure) {
          res.setHeader('Retry-After', String(failure.retryAfter));
          res.status(429).json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many failed attempts. Please try again later.',
            },
          });
          return;
        }

        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized' } });
        return;
      }

      const { profile } = result;
      const identityPhone = profile.phone;

      await adminAuth.clearFailedAttempts({
        phone: identityPhone,
        ip,
        deviceId,
      });

      const { token: sessionToken } = await adminAuth.createSession({
        adminUserId: profile.adminUser.id,
        deviceId,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
      });

      await adminAuth.logLoginEvent({
        phone: identityPhone,
        profileId: profile.id,
        ipAddress: ip,
        deviceId,
        userAgent: req.get('user-agent'),
        success: true,
      });

      res.cookie('admin_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ success: true, adminUser: adminPayload(profile) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Records a failed OTP attempt the client got back from Supabase.
   *
   * Supabase owns OTP verification, so the backend cannot see a wrong code. The
   * client reports it and the same 3-strike lockout applies. This is
   * best-effort by nature (a modified client can skip reporting); the
   * authoritative gate remains `verify-otp`, which requires a real Supabase
   * token.
   */
  router.post('/otp-failed', async (req, res, next) => {
    try {
      const { phone } = req.body ?? {};
      if (!phone || typeof phone !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Phone number required' } });
        return;
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const deviceId = (req.headers['x-device-id'] as string) || req.body?.deviceId;

      const failure = await adminAuth.recordFailedAttempt({ phone, ip, deviceId });
      await adminAuth.logLoginEvent({
        phone,
        ipAddress: ip,
        deviceId,
        userAgent: req.get('user-agent'),
        success: false,
        failureReason: 'invalid_otp',
        blocked: Boolean(failure),
        blockedUntil: failure ? new Date(Date.now() + failure.retryAfter * 1000) : undefined,
      });

      if (failure) {
        res.setHeader('Retry-After', String(failure.retryAfter));
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many failed attempts. Please try again later.' },
        });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAdmin, async (req, res) => {
    const adminUser = (req as any).adminUser;
    res.json({
      adminUser: {
        id: adminUser.id,
        role: adminUser.role,
        permissions: adminUser.permissions ?? null,
        profile: {
          id: adminUser.profile?.id,
          phone: adminUser.profile?.phone,
          fullName: adminUser.profile?.fullName,
          email: adminUser.profile?.email ?? null,
        },
      },
    });
  });

  router.post('/logout', requireAdmin, async (req, res) => {
    const token = req.cookies?.['admin_session'];
    if (token) {
      await adminAuth.revokeSession(token);
    }
    res.clearCookie('admin_session', { path: '/' });
    res.json({ success: true });
  });

  return router;
}
