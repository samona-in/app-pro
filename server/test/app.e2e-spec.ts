import request from 'supertest';
import { createApp } from '../src/app';
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
  redisUrl: 'redis://unused',
  jwtSecret: 'test-secret-that-is-long-enough-to-pass',
  corsOrigins: [],
  googleMapsApiKey: null,
};

const services = {} as Services;
const app = createApp({ config, services });

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
  });
});
