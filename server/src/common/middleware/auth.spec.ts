import express from 'express';
import request from 'supertest';
import { ApiErrorCode } from '@samona/types';
import { logger } from '../logger';
import { errorHandler } from './error-handler';
import { requireRole } from './auth';

const getAuthMock = jest.fn();
jest.mock('@clerk/express', () => ({ getAuth: () => getAuthMock() }));

// Imported after the mock so the middleware sees the stub.
import { createRequireAuth } from './auth';
import type { AuthService } from '../../auth/auth.service';

function appWith(authService: Partial<AuthService>, handler = (_req: unknown, res: never) => res) {
  void handler;
  return express()
    .get('/me', createRequireAuth(authService as AuthService), (req, res) => {
      res.json({ id: req.user?.id, role: req.user?.role });
    })
    .get(
      '/admin',
      createRequireAuth(authService as AuthService),
      requireRole('ADMIN'),
      (_req, res) => {
        res.json({ ok: true });
      },
    )
    .use(errorHandler);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const activeUser = {
  id: 'u1',
  clerkUserId: 'user_abc',
  role: 'PRO' as const,
  phone: '+919876543210',
  email: null,
  fullName: null,
  avatarUrl: null,
  isActive: true,
};

describe('createRequireAuth', () => {
  it('rejects a request with no Clerk session', async () => {
    getAuthMock.mockReturnValue({ userId: null });
    const syncUser = jest.fn();

    const response = await request(appWith({ syncUser })).get('/me').expect(401);

    expect(response.body.error.code).toBe(ApiErrorCode.UNAUTHENTICATED);
    // No session means no database work at all.
    expect(syncUser).not.toHaveBeenCalled();
  });

  it('attaches the local principal for a verified session', async () => {
    getAuthMock.mockReturnValue({ userId: 'user_abc' });
    const syncUser = jest.fn().mockResolvedValue(activeUser);

    const response = await request(appWith({ syncUser })).get('/me').expect(200);

    expect(response.body).toEqual({ id: 'u1', role: 'PRO' });
    expect(syncUser).toHaveBeenCalledWith('user_abc');
  });

  it('takes the role from the database, not from the token', async () => {
    // Clerk says nothing about roles; even if a claim existed, our record wins.
    getAuthMock.mockReturnValue({ userId: 'user_abc', sessionClaims: { role: 'ADMIN' } });
    const syncUser = jest.fn().mockResolvedValue({ ...activeUser, role: 'PRO' });

    // The forged ADMIN claim must not grant access to an admin-only route.
    await request(appWith({ syncUser })).get('/admin').expect(403);
  });

  it('refuses a deactivated account', async () => {
    getAuthMock.mockReturnValue({ userId: 'user_abc' });
    const syncUser = jest.fn().mockResolvedValue({ ...activeUser, isActive: false });

    const response = await request(appWith({ syncUser })).get('/me').expect(403);

    expect(response.body.error.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it('does not leak internals when provisioning fails', async () => {
    getAuthMock.mockReturnValue({ userId: 'user_abc' });
    const syncUser = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));

    const response = await request(appWith({ syncUser })).get('/me').expect(500);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('5432');
    expect(response.body.error.message).toBe('Something went wrong. Please try again.');
  });
});
