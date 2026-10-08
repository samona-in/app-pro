import express from 'express';
import request from 'supertest';
import { ApiErrorCode } from '@samona/types';
import { logger } from '../logger';
import { errorHandler } from './error-handler';
import { requestId } from './request-id';
import { createLimiters } from './rate-limit';

// Limiters fall back to an in-process store without Redis and say so loudly.
beforeEach(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function appWithGlobalLimiter() {
  const limiters = createLimiters({ redis: null });
  return express()
    .use(requestId)
    .use(limiters.global)
    .get('/ping', (_req, res) => {
      res.json({ ok: true });
    })
    .use(errorHandler);
}

describe('rate limiting', () => {
  it('allows traffic under the limit', async () => {
    const app = appWithGlobalLimiter();

    const response = await request(app).get('/ping').expect(200);

    expect(response.body).toEqual({ ok: true });
    // Draft-8 headers, not the legacy X-RateLimit-* set.
    expect(response.headers['ratelimit']).toBeDefined();
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('returns 429 with the shared envelope once the limit is exceeded', async () => {
    const app = appWithGlobalLimiter();
    const agent = request(app);

    // The global limiter allows 300/min; exhaust it.
    let limited: request.Response | undefined;
    for (let i = 0; i < 305; i += 1) {
      const response = await agent.get('/ping');
      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).toBeDefined();
    expect(limited?.status).toBe(429);
    expect(limited?.body.error).toMatchObject({
      code: ApiErrorCode.RATE_LIMITED,
      message: expect.stringContaining('Too many requests'),
    });
    // The client backs off using this rather than guessing.
    expect(limited?.headers['retry-after']).toBeDefined();
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited?.body.error.requestId).toEqual(expect.any(String));
  });

  it('budgets authenticated callers separately from each other', async () => {
    const limiters = createLimiters({ redis: null });
    // Two different users behind one IP must not share a budget.
    const app = express()
      .use(requestId)
      .use((req, _res, next) => {
        req.user = { id: req.get('x-test-user') ?? 'anon', isAdmin: false, appType: null, amr: [] };
        next();
      })
      .use(limiters.auth)
      .get('/login', (_req, res) => {
        res.status(401).json({ ok: false });
      })
      .use(errorHandler);

    // Burn the auth budget (10 per window) as user-a.
    for (let i = 0; i < 12; i += 1) {
      await request(app).get('/login').set('x-test-user', 'user-a');
    }
    const exhausted = await request(app).get('/login').set('x-test-user', 'user-a');
    const otherUser = await request(app).get('/login').set('x-test-user', 'user-b');

    expect(exhausted.status).toBe(429);
    expect(otherUser.status).toBe(401);
  });
});
