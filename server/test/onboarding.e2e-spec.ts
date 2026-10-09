import request from 'supertest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import type { Services } from '../src/context';
import { logger } from '../src/common/logger';

/**
 * Onboarding and profile routes across the real middleware chain.
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
  s3Region: 'us-east-1',
  s3BucketSelfies: 'pro-selfies',
  s3BucketJobImages: 'job-images',
  s3BucketAvatars: 'avatars',
  s3BucketDocuments: 'pro-documents',
  s3PublicBaseUrlSelfies: null,
  s3PublicBaseUrlJobImages: null,
  s3PublicBaseUrlAvatars: null,
  s3Endpoint: null,
  s3Credentials: null,
  s3ForcePathStyle: true,
  corsOrigins: [],
  googleMapsApiKey: null,
  geocodingBaseUrl: 'https://photon.komoot.io',
  geocodingTimeoutMs: 8_000,
  geocodingFallbackUrl: null,
  expoAccessToken: null,
  jobAlertRepeatMs: 60_000,
  jobAlertMaxRepeats: 20,
  jobAlertRearmCooldownMs: 5 * 60_000,
  jobCatchupWindowMs: 2 * 60 * 60_000,
  jobCatchupLimit: 3,
  jobExpireTtlMs: 30 * 60_000,
  jobExpireSweepMs: 60_000,
  fcmProjectId: null,
  fcmClientEmail: null,
  fcmPrivateKey: null,
  jobAlertTtlMs: 60_000,
  jobOfferSecret: null,
  jobOfferTtlMs: 90_000,
  supabaseServiceRoleKey: null,
  accountDeletionReauthWindowMs: 5 * 60_000,
  accountDeletionTokenTtlMs: 5 * 60_000,
  accountDeletionSweepMs: 30_000,
  accountDeletionMaxAttempts: 5,
  retentionCleanupEnabled: false,
  retentionDryRunDefault: true,
  retentionSafetyWindowDays: 7,
  retentionSweepMs: 24 * 60 * 60 * 1000,
  retentionLockTtlMs: 5 * 60 * 1000,
  retentionLockRetryMs: 1000,
  retention: {
    enabled: false,
    dryRunDefault: true,
    safetyWindowDays: 7,
    lockTtlMs: 5 * 60 * 1000,
    lockRetryMs: 1000,
    sweepMs: 24 * 60 * 60 * 1000,
    categories: {
      proDocuments: false,
      selfies: false,
      avatarsPro: false,
      avatarsCustomer: false,
      jobImages: false,
      notificationsPro: false,
      customerNotifications: false,
      accountDeletionAudit: false,
      savedAddresses: false,
      proServicesSkills: false,
      jobDeclinesOffers: false,
      messages: false,
      jobsCompleted: false,
      jobsCancelled: false,
    },
    periods: {},
  },
};

const services = {
  tokenVerifier: { verify: jest.fn() },
  auth: { syncUser: jest.fn() },
  pros: {
    listCatalogue: jest.fn(),
    ensureForUser: jest.fn(),
    applyOnboardingPatch: jest.fn(),
    setServiceRadius: jest.fn().mockResolvedValue({ serviceRadiusKm: 5 }),
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

describe('Service radius route (e2e)', () => {
  function signInAsPro() {
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
  }

  it('refuses the route without a token', async () => {
    await request(app).patch('/api/v1/pros/me/service-radius').send({ serviceRadiusKm: 5 }).expect(401);
    expect(services.pros.setServiceRadius).not.toHaveBeenCalled();
  });

  it('422s a radius outside the allowed bounds with the shared envelope', async () => {
    signInAsPro();

    const response = await request(app)
      .patch('/api/v1/pros/me/service-radius')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'pro')
      .send({ serviceRadiusKm: 500 })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(services.pros.setServiceRadius).not.toHaveBeenCalled();
  });

  it('scopes the write to the token user and ignores a supplied pro id', async () => {
    signInAsPro();

    const response = await request(app)
      .patch('/api/v1/pros/me/service-radius')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'pro')
      .send({ serviceRadiusKm: 5, proId: 'someone-else' })
      .expect(200);

    expect(response.body).toEqual({ serviceRadiusKm: 5 });
    expect(services.pros.setServiceRadius).toHaveBeenCalledWith('user-1', 5);
  });
});
