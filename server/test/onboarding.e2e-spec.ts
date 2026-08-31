import request from 'supertest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import type { Services } from '../src/context';
import { logger } from '../src/common/logger';

/**
 * Onboarding routes across the real middleware chain.
 *
 * Services are stubbed, so this asserts the HTTP contract — auth, validation
 * and error shape — without PostgreSQL. The persistence rules are covered by
 * the unit specs.
 */
const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  isProduction: false,
  databaseUrl: 'postgresql://unused',
  directUrl: 'postgresql://unused',
  redisUrl: 'redis://unused',
  supabaseUrl: 'https://project.supabase.co',
  supabaseJwksUrl: null,
  supabaseJwtSecret: null,
  supabaseSecretKey: null,
  corsOrigins: [],
  googleMapsApiKey: null,
};

const services = {
  tokenVerifier: { verify: jest.fn() },
  auth: { syncUser: jest.fn() },
  pros: {
    listCatalogue: jest.fn(),
    ensureForUser: jest.fn(),
    applyOnboardingPatch: jest.fn(),
  },
  users: { findById: jest.fn() },
} as unknown as Services;

const app = createApp({ config, services, rateLimit: { redis: null, disabled: true } });

beforeAll(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => jest.clearAllMocks());

describe('Onboarding routes (e2e)', () => {
  it('refuses every pros route without a token', async () => {
    await request(app).get('/api/v1/pros/me').expect(401);
    await request(app).get('/api/v1/pros/catalogue').expect(401);
    await request(app).patch('/api/v1/pros/me/onboarding').send({ bio: 'x' }).expect(401);
  });

  it('rejects a server-controlled field before it reaches the service', async () => {
    (services.tokenVerifier.verify as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      phone: null,
      email: null,
    });
    (services.auth.syncUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      isAdmin: false,
      appType: 'pro',
      isActive: true,
    });

    // Only `bio` survives validation; the rest never reach the service.
    await request(app)
      .patch('/api/v1/pros/me/onboarding')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'pro')
      .send({ bio: 'Hi', isVerified: true, rating: 5, onboardingStatus: 'COMPLETED' })
      .expect(200);

    expect(services.pros.applyOnboardingPatch).toHaveBeenCalledWith('user-1', { bio: 'Hi' });
  });

  it('rejects an empty onboarding patch with the shared error envelope', async () => {
    (services.tokenVerifier.verify as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      phone: null,
      email: null,
    });
    (services.auth.syncUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      isAdmin: false,
      appType: 'pro',
      isActive: true,
    });

    const response = await request(app)
      .patch('/api/v1/pros/me/onboarding')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'pro')
      .send({})
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(services.pros.applyOnboardingPatch).not.toHaveBeenCalled();
  });

  it('refuses the pro surface when the caller is on the customer surface', async () => {
    (services.tokenVerifier.verify as jest.Mock).mockResolvedValue({
      userId: 'user-2',
      phone: null,
      email: null,
    });
    (services.auth.syncUser as jest.Mock).mockResolvedValue({
      id: 'user-2',
      isAdmin: false,
      appType: 'customer',
      isActive: true,
    });

    await request(app)
      .get('/api/v1/pros/me')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(403);
  });

  it('allows the pro surface for the same account', async () => {
    (services.tokenVerifier.verify as jest.Mock).mockResolvedValue({
      userId: 'user-2',
      phone: null,
      email: null,
    });
    (services.auth.syncUser as jest.Mock).mockResolvedValue({
      id: 'user-2',
      isAdmin: false,
      appType: 'pro',
      isActive: true,
    });

    await request(app)
      .get('/api/v1/pros/me')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'pro')
      .expect(200);
  });
});
