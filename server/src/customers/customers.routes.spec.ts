import request from 'supertest';
import express from 'express';
import { ApiErrorCode, OnboardingStatus } from '@samona/types';
import type { CustomerProfile } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createCustomersRouter } from './customers.routes';

const activeUser = {
  id: 'user-1',
  appType: 'customer' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

const profile: CustomerProfile = {
  id: 'cust-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.NOT_STARTED,
  displayName: null,
  gender: null,
  locationLabel: null,
  locationPlaceId: null,
  latitude: null,
  longitude: null,
  avatarUrl: null,
};

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeUser.id, phone: activeUser.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeUser) },
    customers: {
      ensureForUser: jest.fn().mockResolvedValue(profile),
      applyOnboardingPatch: jest
        .fn()
        .mockResolvedValue({ ...profile, onboardingStatus: OnboardingStatus.COMPLETED }),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express()
    .use(express.json())
    .use('/customers', createCustomersRouter(services))
    .use(errorHandler);
}

describe('customers routes', () => {
  it('GET /customers/me returns the customer profile', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .get('/customers/me')
      .set('authorization', 'Bearer good.token')
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'cust-1',
      onboardingStatus: 'NOT_STARTED',
    });
  });

  it('PATCH /customers/me/onboarding saves a step', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .patch('/customers/me/onboarding')
      .set('authorization', 'Bearer good.token')
      .send({ displayName: 'Priya Sharma' })
      .expect(200);

    expect(response.body.onboardingStatus).toBe('COMPLETED');
  });

  it('rejects an empty patch', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .patch('/customers/me/onboarding')
      .set('authorization', 'Bearer good.token')
      .send({})
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
  });

  it('rejects requests without auth', async () => {
    const services = buildServices();
    await request(appWith(services)).get('/customers/me').expect(401);
  });

  it('rejects a user on the pro surface from customer routes', async () => {
    const proUser = { ...activeUser, appType: 'pro' as const };
    const services = buildServices({
      auth: { syncUser: jest.fn().mockResolvedValue(proUser) },
    });

    const response = await request(appWith(services))
      .get('/customers/me')
      .set('authorization', 'Bearer good.token')
      .expect(403);

    expect(response.body.error.code).toBe(ApiErrorCode.FORBIDDEN);
  });
});
