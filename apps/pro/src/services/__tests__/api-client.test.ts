import {
  createApiClient,
  isApiError,
  isRateLimited,
  isRetryable,
  retryDelayMs,
} from '@samona/api-client';

/** Builds a fetch stand-in returning one canned response. */
function fakeFetch(init: { status: number; body?: unknown; headers?: Record<string, string> }) {
  return jest.fn(
    async () =>
      new Response(init.body === undefined ? null : JSON.stringify(init.body), {
        status: init.status,
        headers: { 'content-type': 'application/json', ...init.headers },
      }),
  ) as unknown as typeof fetch;
}

const baseOptions = { baseUrl: 'https://api.samona.test', prefix: '/api/v1' };

describe('API client rate-limit handling', () => {
  it('surfaces a 429 as a rate-limited ApiError', async () => {
    const client = createApiClient({
      ...baseOptions,
      fetchImpl: fakeFetch({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
        headers: { 'retry-after': '30' },
      }),
    });

    await expect(client.get('/jobs')).rejects.toMatchObject({ name: 'ApiError' });

    const error = await client.get('/jobs').catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(isRateLimited(error)).toBe(true);
    expect(isRetryable(error)).toBe(true);
  });

  it('reads Retry-After given in seconds', async () => {
    const client = createApiClient({
      ...baseOptions,
      fetchImpl: fakeFetch({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Slow down.' } },
        headers: { 'retry-after': '30' },
      }),
    });

    const error = await client.get('/jobs').catch((e: unknown) => e);

    expect(isApiError(error) && error.retryAfterMs).toBe(30_000);
  });

  it('reads Retry-After given as an HTTP date', async () => {
    const when = new Date(Date.now() + 60_000).toUTCString();
    const client = createApiClient({
      ...baseOptions,
      fetchImpl: fakeFetch({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Slow down.' } },
        headers: { 'retry-after': when },
      }),
    });

    const error = await client.get('/jobs').catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    // Allow for the milliseconds spent in the call itself.
    expect(isApiError(error) ? (error.retryAfterMs ?? 0) : 0).toBeGreaterThan(55_000);
  });

  it('ignores a malformed Retry-After rather than trusting it', async () => {
    const client = createApiClient({
      ...baseOptions,
      fetchImpl: fakeFetch({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Slow down.' } },
        headers: { 'retry-after': 'not-a-date' },
      }),
    });

    const error = await client.get('/jobs').catch((e: unknown) => e);

    expect(isApiError(error) && error.retryAfterMs).toBeUndefined();
  });
});

describe('retryDelayMs', () => {
  it('uses the delay the server asked for', () => {
    const error = { name: 'ApiError', code: 'RATE_LIMITED', retryAfterMs: 30_000 };
    Object.setPrototypeOf(error, Error.prototype);

    expect(retryDelayMs(error, 0)).toBe(30_000);
  });

  it('backs off exponentially with jitter when the server gives no hint', () => {
    const delays = Array.from({ length: 40 }, () => retryDelayMs(new Error('boom'), 3));

    // Full jitter: bounded by the exponential cap, never negative.
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(8_000);
    }
    // Jitter must actually vary, or every client retries in lockstep.
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('caps the backoff so a long outage does not produce absurd delays', () => {
    expect(retryDelayMs(new Error('boom'), 20)).toBeLessThanOrEqual(30_000);
  });
});

describe('HTTPS enforcement', () => {
  it('refuses a cleartext base URL when required', () => {
    expect(() => createApiClient({ baseUrl: 'http://api.samona.in', requireHttps: true })).toThrow(
      /plain HTTP/,
    );
  });

  it('allows loopback so local development still works', () => {
    expect(() =>
      createApiClient({ baseUrl: 'http://localhost:4000', requireHttps: true }),
    ).not.toThrow();
  });

  it('allows https', () => {
    expect(() =>
      createApiClient({ baseUrl: 'https://api.samona.in', requireHttps: true }),
    ).not.toThrow();
  });
});
