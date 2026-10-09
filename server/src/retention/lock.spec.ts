import { createDistributedLock } from './lock';
import type { Redis } from '../database/redis';

function fakeRedis(overrides: Partial<Record<'set' | 'eval', jest.Mock>> = {}) {
  const redis = {
    set: jest.fn(async () => 'OK'),
    eval: jest.fn(async () => 1),
    ...overrides,
  };
  return redis as unknown as Redis & { set: jest.Mock; eval: jest.Mock };
}

describe('distributed retention lock', () => {
  it('fails closed when Redis is unavailable', async () => {
    const lock = createDistributedLock({
      redis: null,
      lockKey: 'retention:lock',
      ttlMs: 5000,
      retryMs: 100,
    });

    await expect(lock.acquire()).resolves.toEqual({ token: '', acquired: false });
  });

  it('acquires with a TTL and releases only the token it owns', async () => {
    const redis = fakeRedis();
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 5000,
      retryMs: 100,
    });

    const attempt = await lock.acquire();
    expect(attempt.acquired).toBe(true);
    expect(attempt.token).not.toBe('');
    expect(redis.set).toHaveBeenCalledWith('retention:lock', attempt.token, 'PX', 5000, 'NX');

    await lock.release(attempt.token);
    expect(redis.eval).toHaveBeenCalled(); // compare-and-delete script
  });

  it('reports not acquired when another instance holds the lock', async () => {
    const redis = fakeRedis({ set: jest.fn(async () => null) });
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 5000,
      retryMs: 100,
    });

    await expect(lock.acquire()).resolves.toEqual({ token: '', acquired: false });
  });

  it('fails closed when acquiring throws', async () => {
    const redis = fakeRedis({
      set: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 5000,
      retryMs: 100,
    });

    await expect(lock.acquire()).resolves.toEqual({ token: '', acquired: false });
  });

  it('never releases without a token', async () => {
    const redis = fakeRedis();
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 5000,
      retryMs: 100,
    });

    await lock.release('');

    expect(redis.eval).not.toHaveBeenCalled();
  });
});
