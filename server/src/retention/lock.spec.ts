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

describe('distributed retention lock — keepalive', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-extends on a cadence below the TTL and stops on request', async () => {
    jest.useFakeTimers();
    const redis = fakeRedis(); // eval resolves 1 => still owned
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 1000,
      retryMs: 100,
    });
    const onLost = jest.fn();

    const renewal = lock.startRenewal('tok', onLost);
    await jest.advanceTimersByTimeAsync(1400); // ticks at 500 and 1000

    expect(redis.eval).toHaveBeenCalledTimes(2);
    expect(onLost).not.toHaveBeenCalled();

    renewal.stop();
    await jest.advanceTimersByTimeAsync(2000);

    expect(redis.eval).toHaveBeenCalledTimes(2);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('reports loss once when the token is no longer owned', async () => {
    jest.useFakeTimers();
    const redis = fakeRedis({ eval: jest.fn(async () => 0) }); // pexpire on a foreign key
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 1000,
      retryMs: 100,
    });
    const onLost = jest.fn();

    lock.startRenewal('tok', onLost);
    await jest.advanceTimersByTimeAsync(3000);

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Redis fails during renewal', async () => {
    jest.useFakeTimers();
    const redis = fakeRedis({
      eval: jest.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 1000,
      retryMs: 100,
    });
    const onLost = jest.fn();

    const renewal = lock.startRenewal('tok', onLost);
    await jest.advanceTimersByTimeAsync(600);

    expect(onLost).toHaveBeenCalledTimes(1);
    // The keepalive swallowed the error and surfaced it as loss, not a throw.
    renewal.stop();
  });

  it('never overlaps consecutive re-extends', async () => {
    jest.useFakeTimers();
    let release: (value: number) => void = () => {};
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const redis = fakeRedis({ eval: jest.fn(() => pending) });
    const lock = createDistributedLock({
      redis,
      lockKey: 'retention:lock',
      ttlMs: 1000,
      retryMs: 100,
    });
    const onLost = jest.fn();

    const renewal = lock.startRenewal('tok', onLost);
    await jest.advanceTimersByTimeAsync(1400); // two ticks, one extend in flight

    expect(redis.eval).toHaveBeenCalledTimes(1);

    release(1);
    await Promise.resolve();
    renewal.stop();
    expect(onLost).not.toHaveBeenCalled();
  });
});
