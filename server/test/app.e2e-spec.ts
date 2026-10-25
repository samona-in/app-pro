import request from 'supertest';
import { createApp } from '../src/app';
import { logger } from '../src/common/logger';
import type { AppConfig } from '../src/config';
import type { Services } from '../src/context';

/**
 * End-to-end check across the real middleware chain.
 *
 * `createApp` takes its dependencies as arguments, so the suite runs without
 * PostgreSQL or Redis; services are stubbed because no route touches them yet.
 */
const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  isProduction: false,
  databaseUrl: 'postgresql://unused',
  directUrl: 'postgresql://unused',
  redisUrl: 'redis://unused',
  supabaseUrl: 'https://project.supabase.co',
  supabaseJwtSecret: null,
  supabaseJwksUrl: null,
  s3Region: 'us-east-1',
  s3BucketSelfies: 'pro-selfies',
  s3BucketJobImages: 'job-images',
  s3BucketAvatars: 'avatars',
  s3BucketDocuments: 'pro-documents',
  s3PublicBaseUrlSelfies: null,
  s3PublicBaseUrlJobImages: null,
  s3PublicBaseUrlAvatars: null,
  s3BucketBanners: null,
  s3PublicBaseUrlBanners: null,
  s3Endpoint: null,
  s3Credentials: null,
  s3ForcePathStyle: true,
  corsOrigins: [],
  googleMapsApiKey: null,
  googleGeocodingBaseUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
  googlePlacesBaseUrl: 'https://places.googleapis.com/v1',
  geocodingTimeoutMs: 8_000,
  geocodingCacheTtlMs: 2_592_000_000,
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

const services = {} as Services;
// Limiting is on by default; these assertions stay well under the budget.
const app = createApp({ config, services });

// The in-process limiter fallback warns on construction; silence it here.
beforeAll(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('API (e2e)', () => {
  it('GET /api/v1/health returns ok', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns the shared error envelope for an unknown route', async () => {
    const response = await request(app).get('/api/v1/nope').expect(404);

    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Cannot GET'),
      }),
    });
  });

  it('does not advertise the server implementation', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['etag']).toBeUndefined();
  });

  it('sends the hardened security headers', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    // This origin serves JSON only, so scripts and framing are denied outright.
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('rejects a non-JSON write before parsing its body', async () => {
    const response = await request(app)
      .post('/api/v1/jobs')
      .type('form')
      .send('amount=1')
      .expect(415);

    expect(response.body.error.message).toContain('application/json');
  });

  it('applies rate limiting when it is enabled', async () => {
    // A separate instance so exhausting the budget cannot affect other tests.
    const limited = createApp({ config, services, rateLimit: { redis: null } });

    let sawLimit = false;
    for (let i = 0; i < 320; i += 1) {
      const response = await request(limited).get('/api/v1/health');
      if (response.status === 429) {
        sawLimit = true;
        expect(response.body.error.code).toBe('RATE_LIMITED');
        expect(response.headers['retry-after']).toBeDefined();
        break;
      }
    }

    expect(sawLimit).toBe(true);
  });
});
