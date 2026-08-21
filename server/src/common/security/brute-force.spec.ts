import type { Redis } from '../../database/redis';
import { logger } from '../logger';
import { createBruteForceGuard, safeEqual } from './brute-force';

/** Minimal in-memory stand-in for the Redis commands the guard uses. */
function fakeRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();

  return {
    keys: () => [...values.keys()],
    client: {
      get: async (key: string) => {
        const value = values.get(key);
        return value === undefined ? null : String(value);
      },
      ttl: async (key: string) => ttls.get(key) ?? -1,
      incr: async (key: string) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      },
      expire: async (key: string, seconds: number) => {
        ttls.set(key, seconds);
        return 1;
      },
      del: async (key: string) => {
        values.delete(key);
        ttls.delete(key);
        return 1;
      },
    } as unknown as Redis,
  };
}

beforeEach(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('brute-force guard', () => {
  it('locks an identity after the configured number of failures', async () => {
    const redis = fakeRedis();
    const guard = createBruteForceGuard(redis.client, { maxAttempts: 3 });

    expect((await guard.check('+919876543210')).locked).toBe(false);

    await guard.recordFailure('+919876543210');
    await guard.recordFailure('+919876543210');
    const third = await guard.recordFailure('+919876543210');

    expect(third.locked).toBe(true);
    expect(third.attemptsRemaining).toBe(0);
    expect((await guard.check('+919876543210')).locked).toBe(true);
    expect((await guard.check('+919876543210')).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('locks the targeted account regardless of where attempts come from', async () => {
    // The password-spray shape: many sources, one victim. IP-keyed limiting
    // would miss this entirely.
    const redis = fakeRedis();
    const guard = createBruteForceGuard(redis.client, { maxAttempts: 3 });

    await guard.recordFailure('victim@samona.in');
    await guard.recordFailure('victim@samona.in');
    await guard.recordFailure('victim@samona.in');

    expect((await guard.check('victim@samona.in')).locked).toBe(true);
    // A different account is unaffected.
    expect((await guard.check('someone-else@samona.in')).locked).toBe(false);
  });

  it('treats an identity case- and whitespace-insensitively', async () => {
    const redis = fakeRedis();
    const guard = createBruteForceGuard(redis.client, { maxAttempts: 2 });

    await guard.recordFailure('User@Samona.in');
    const second = await guard.recordFailure('  user@samona.in  ');

    // Otherwise an attacker cycles casing to reset the counter.
    expect(second.locked).toBe(true);
  });

  it('never stores the raw identifier as a key', async () => {
    const redis = fakeRedis();
    const guard = createBruteForceGuard(redis.client);

    await guard.recordFailure('+919876543210');

    // Keys leak into logs and KEYS dumps; PII must not be among them.
    for (const key of redis.keys()) {
      expect(key).not.toContain('919876543210');
      expect(key).toMatch(/^bf:[a-f0-9]{32}$/);
    }
  });

  it('clears the counter on success', async () => {
    const redis = fakeRedis();
    const guard = createBruteForceGuard(redis.client, { maxAttempts: 3 });

    await guard.recordFailure('pro@samona.in');
    await guard.reset('pro@samona.in');
    const status = await guard.check('pro@samona.in');

    expect(status.locked).toBe(false);
    expect(status.attemptsRemaining).toBe(3);
  });

  it('allows the attempt when Redis is unavailable rather than locking everyone out', async () => {
    const guard = createBruteForceGuard(null);

    await guard.recordFailure('pro@samona.in');
    await guard.recordFailure('pro@samona.in');
    await guard.recordFailure('pro@samona.in');
    await guard.recordFailure('pro@samona.in');
    await guard.recordFailure('pro@samona.in');
    await guard.recordFailure('pro@samona.in');

    // Rate limiting still fronts this path; a cache outage must not become an
    // account-wide denial of service.
    expect((await guard.check('pro@samona.in')).locked).toBe(false);
  });
});

describe('safeEqual', () => {
  it('matches identical secrets and rejects different ones', () => {
    expect(safeEqual('one-time-code-123456', 'one-time-code-123456')).toBe(true);
    expect(safeEqual('one-time-code-123456', 'one-time-code-123457')).toBe(false);
  });

  it('handles differing lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch; the throw itself leaks length.
    expect(() => safeEqual('short', 'considerably-longer-value')).not.toThrow();
    expect(safeEqual('short', 'considerably-longer-value')).toBe(false);
  });
});
