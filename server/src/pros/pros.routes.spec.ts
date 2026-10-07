import request from 'supertest';
import express from 'express';
import { ApiErrorCode, OnboardingStatus, ProServiceStatus } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createProsRouter } from './pros.routes';

/**
 * HTTP contract for the Manage Services endpoints: auth, role gate, path
 * validation and error envelope. The state machine itself is covered in
 * `pro-services.spec.ts`.
 */

const proUser = {
  id: 'user-1',
  appType: 'pro' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

const entry = {
  id: 'svc-1',
  slug: 'plumbing',
  name: 'Plumbing',
  icon: 'wrench-outline',
  status: ProServiceStatus.PENDING as string | null,
  rejectionReason: null as string | null,
};

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: proUser.id, phone: proUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
    pros: {
      listProServices: jest.fn().mockResolvedValue([entry]),
      requestProService: jest.fn().mockResolvedValue(entry),
      ensureForUser: jest.fn().mockResolvedValue({
        id: 'pro-1',
        userId: 'user-1',
        onboardingStatus: OnboardingStatus.COMPLETED,
        serviceIds: [],
        skillIds: [],
        proServices: [],
      }),
      listCatalogue: jest.fn().mockResolvedValue({ services: [], skills: [] }),
      applyOnboardingPatch: jest.fn(),
      setAvailability: jest.fn(),
      setSelfieUploaded: jest.fn(),
      findByUserId: jest.fn(),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express().use(express.json()).use('/pros', createProsRouter(services)).use(errorHandler);
}

const authed = (req: request.Test) => req.set('authorization', 'Bearer good.token');

describe('GET /pros/services', () => {
  it('requires a token', async () => {
    const services = buildServices();
    await request(appWith(services)).get('/pros/services').expect(401);
    expect(services.pros.listProServices).not.toHaveBeenCalled();
  });

  it('rejects a customer-surface token', async () => {
    const services = buildServices();
    (services.tokenVerifier.verify as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      phone: null,
      email: null,
    });
    (services.auth.syncUser as jest.Mock).mockResolvedValue({ ...proUser, appType: 'customer' });

    const response = await authed(
      request(appWith(services)).get('/pros/services').set('x-app-type', 'pro'),
    ).expect(403);

    expect(response.body.error.code).toBe(ApiErrorCode.FORBIDDEN);
  });

  it('returns the merged catalogue for the caller only', async () => {
    const services = buildServices();
    const response = await authed(
      request(appWith(services)).get('/pros/services').set('x-app-type', 'pro'),
    ).expect(200);

    expect(response.body).toEqual([entry]);
    // The user id comes from the token; nothing in the request can aim it at
    // another pro's rows.
    expect(services.pros.listProServices).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /pros/services/:serviceId/request', () => {
  const uuid = 'a263f9c5-660e-4dc3-a92a-c36b9da3a7f5';

  it('requires a token', async () => {
    const services = buildServices();
    await request(appWith(services)).post(`/pros/services/${uuid}/request`).expect(401);
    expect(services.pros.requestProService).not.toHaveBeenCalled();
  });

  it('422s a malformed service id instead of letting Prisma 500', async () => {
    const services = buildServices();
    const response = await authed(
      request(appWith(services)).post('/pros/services/not-a-uuid/request').set('x-app-type', 'pro'),
    ).expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.pros.requestProService).not.toHaveBeenCalled();
  });

  it('passes the token user and the path service id to the service', async () => {
    const services = buildServices();
    const response = await authed(
      request(appWith(services)).post(`/pros/services/${uuid}/request`).set('x-app-type', 'pro'),
    ).expect(200);

    expect(response.body).toMatchObject({ id: 'svc-1', status: 'PENDING' });
    expect(services.pros.requestProService).toHaveBeenCalledWith('user-1', uuid);
  });

  it('surfaces the state machine as the shared error envelope', async () => {
    const services = buildServices();
    (services.pros.requestProService as jest.Mock).mockRejectedValue(
      Object.assign(new Error('That service is already approved for you.'), {
        name: 'HttpError',
        status: 409,
        code: ApiErrorCode.CONFLICT,
      }),
    );

    const response = await authed(
      request(appWith(services)).post(`/pros/services/${uuid}/request`).set('x-app-type', 'pro'),
    ).expect(409);

    expect(response.body.error.code).toBe(ApiErrorCode.CONFLICT);
  });
});
