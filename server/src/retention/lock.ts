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

  return { acquire, release, extend, key, ttlMs, retryMs };
}

export type DistributedLock = ReturnType<typeof createDistributedLock>;
