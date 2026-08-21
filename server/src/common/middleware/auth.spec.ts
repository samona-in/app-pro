import express from 'express';
import request from 'supertest';
import { ApiErrorCode } from '@samona/types';
import type { AuthService } from '../../auth/auth.service';
import type { TokenVerifier } from '../../auth/token';
import { logger } from '../logger';
import { createRequireAuth, requireRole } from './auth';
import { errorHandler } from './error-handler';

const activeUser = {
  id: '11111111-2222-3333-4444-555555555555',
  role: 'PRO' as const,
  phone: '+919876543210',
  email: null,
  fullName: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(),
};

function appWith(verifier: Partial<TokenVerifier>, authService: Partial<AuthService>) {
  const requireAuth = createRequireAuth({
    verifier: verifier as TokenVerifier,
    authService: authService as AuthService,
  });

  return express()
    .get('/me', requireAuth, (req, res) => {
      res.json({ id: req.user?.id, role: req.user?.role });
    })
    .get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => {
      res.json({ ok: true });
    })
    .use(errorHandler);
}

beforeEach(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('createRequireAuth', () => {
  it('rejects a request with no Authorization header', async () => {
    const verify = jest.fn();
    const syncUser = jest.fn();

    const response = await request(appWith({ verify }, { syncUser })).get('/me').expect(401);

    expect(response.body.error.code).toBe(ApiErrorCode.UNAUTHENTICATED);
    // Nothing is verified and no database work happens without a token.
    expect(verify).not.toHaveBeenCalled();
    expect(syncUser).not.toHaveBeenCalled();
  });

  it('rejects a token the verifier refuses', async () => {
    const verify = jest.fn().mockResolvedValue(null);
    const syncUser = jest.fn();

    const response = await request(appWith({ verify }, { syncUser }))
      .get('/me')
      .set('authorization', 'Bearer forged.token.value')
      .expect(401);

    expect(response.body.error.code).toBe(ApiErrorCode.UNAUTHENTICATED);
    expect(syncUser).not.toHaveBeenCalled();
  });

  it('attaches the local principal for a verified token', async () => {
    const verify = jest
      .fn()
      .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null });
    const syncUser = jest.fn().mockResolvedValue(activeUser);

    const response = await request(appWith({ verify }, { syncUser }))
      .get('/me')
      .set('authorization', 'Bearer good.token.value')
      .expect(200);

    expect(response.body).toEqual({ id: activeUser.id, role: 'PRO' });
  });

  it('takes the role from the database, not from the token', async () => {
    // Supabase lets a project attach custom claims. A claim we do not issue is
    // not a basis for authorisation.
    const verify = jest.fn().mockResolvedValue({
      userId: activeUser.id,
      phone: activeUser.phone,
      email: null,
      role: 'ADMIN',
    });
    const syncUser = jest.fn().mockResolvedValue({ ...activeUser, role: 'PRO' });

    await request(appWith({ verify }, { syncUser }))
      .get('/admin')
      .set('authorization', 'Bearer good.token.value')
      .expect(403);
  });

  it('refuses a deactivated account', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: activeUser.id, phone: null, email: null });
    const syncUser = jest.fn().mockResolvedValue({ ...activeUser, isActive: false });

    const response = await request(appWith({ verify }, { syncUser }))
      .get('/me')
      .set('authorization', 'Bearer good.token.value')
      .expect(403);

    expect(response.body.error.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it('does not leak internals when provisioning fails', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: activeUser.id, phone: null, email: null });
    const syncUser = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));

    const response = await request(appWith({ verify }, { syncUser }))
      .get('/me')
      .set('authorization', 'Bearer good.token.value')
      .expect(500);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('5432');
    expect(response.body.error.message).toBe('Something went wrong. Please try again.');
  });
});
