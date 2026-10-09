import type { Redis } from '../database/redis';
import { logger } from '../common/logger';

export interface DistributedLockDeps {
  redis: Redis | null;
  lockKey: string;
  ttlMs: number;
  retryMs: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RETRY_MS = 1000;

export function createDistributedLock(deps: DistributedLockDeps) {
  const redis = deps.redis;
  const key = deps.lockKey;
  const ttlMs = deps.ttlMs > 0 ? deps.ttlMs : DEFAULT_TTL_MS;
  const retryMs = deps.retryMs > 0 ? deps.retryMs : DEFAULT_RETRY_MS;

  function generateToken(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function acquire(): Promise<{ token: string; acquired: boolean }> {
    if (!redis) {
      // No Redis available - degrade safely by returning not acquired
      // to avoid concurrent runs in single-process; but better to log
      logger.warn('Redis not available for retention lock; skipping distributed lock acquisition');
      return { token: '', acquired: false };
    }
    const token = generateToken();
    try {
      const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return { token, acquired: true };
      }
    } catch (error) {
      logger.error('Failed to acquire retention lock', error);
      return { token: '', acquired: false };
    }
    return { token: '', acquired: false };
  }

  async function release(token: string): Promise<void> {
    if (!redis || !token) return;
    try {
      // Only release if we own the lock
      const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(lua, 1, key, token);
    } catch (error) {
      logger.error('Failed to release retention lock', error);
    }
  }

  async function extend(token: string, extendMs = ttlMs): Promise<boolean> {
    if (!redis || !token) return false;
    try {
      const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const res = (await redis.eval(lua, 1, key, token, extendMs)) as number;
      return res === 1;
    } catch (error) {
      logger.error('Failed to extend retention lock', error);
      return false;
    }
  }

  /**
   * Keepalive for a held lock.
   *
   * The sweep can outlive the lock's TTL. Without renewal the key lapses while
   * the holder is still working, another worker acquires it, and two processes
   * delete concurrently. This re-extends on a cadence shorter than the TTL so
   * the lock cannot lapse while the holder is alive and Redis reachable.
   *
   * Interruption is fail-closed: if a re-extend shows the token is no longer
   * owned, or the call fails, `onLost` fires and the caller must stop its
   * destructive work. `onLost` runs at most once.
   */
  function startRenewal(
    token: string,
    onLost: () => void,
    intervalMs: number = Math.max(1, Math.floor(ttlMs / 2)),
  ): { stop: () => void } {
    let stopped = false;
    let inFlight = false;

    function lose() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      onLost();
    }

    function tick() {
      if (stopped || inFlight) return;
      inFlight = true;
      void extend(token)
        .then((held) => {
          if (!held) lose();
        })
        .catch(() => lose())
        .finally(() => {
          inFlight = false;
        });
    }

    const timer = setInterval(tick, intervalMs);
    // The keepalive must never be the reason the process stays alive.
    if (typeof timer.unref === 'function') timer.unref();

    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  return { acquire, release, extend, startRenewal, key, ttlMs, retryMs };
}

export type DistributedLock = ReturnType<typeof createDistributedLock>;
