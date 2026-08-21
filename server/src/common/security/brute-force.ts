import { createHash, timingSafeEqual } from 'node:crypto';
import type { Redis } from '../../database/redis';
import { logger } from '../logger';

/**
 * Per-identity brute-force protection.
 *
 * Rate limiting caps how fast one *caller* can hit an endpoint. It does not stop
 * a slow attack spread across many IPs against a single account — the classic
 * password-spray shape. This tracks failures against the identity being
 * targeted, so the account locks no matter where the attempts originate.
 *
 * Two layers, both required:
 *   - the rate limiter, keyed by caller
 *   - this, keyed by the account under attack
 */

export interface BruteForceOptions {
  /** Failures before the identity is locked. */
  maxAttempts?: number;
  /** How long failures are remembered, in seconds. */
  windowSeconds?: number;
  /** How long a lock lasts once tripped, in seconds. */
  lockSeconds?: number;
}

export interface BruteForceStatus {
  locked: boolean;
  /** Seconds until the lock lifts. 0 when not locked. */
  retryAfterSeconds: number;
  attemptsRemaining: number;
}

const DEFAULTS = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  lockSeconds: 15 * 60,
} as const;

/**
 * Hashes the identifier before it becomes a Redis key.
 *
 * Keys end up in logs, `KEYS` dumps and memory profiles. Storing a raw phone
 * number or email there turns an ops artefact into a PII leak, so only a digest
 * is persisted — it is equality-comparable, which is all this needs.
 */
function identityKey(identifier: string): string {
  const digest = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
  return `bf:${digest.slice(0, 32)}`;
}

export interface BruteForceGuard {
  check(identifier: string): Promise<BruteForceStatus>;
  recordFailure(identifier: string): Promise<BruteForceStatus>;
  reset(identifier: string): Promise<void>;
}

export function createBruteForceGuard(
  redis: Redis | null,
  options: BruteForceOptions = {},
): BruteForceGuard {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const windowSeconds = options.windowSeconds ?? DEFAULTS.windowSeconds;
  const lockSeconds = options.lockSeconds ?? DEFAULTS.lockSeconds;

  const unlocked: BruteForceStatus = {
    locked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: maxAttempts,
  };

  async function check(identifier: string): Promise<BruteForceStatus> {
    if (!redis) return unlocked;

    const key = identityKey(identifier);
    try {
      const [attemptsRaw, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
      const attempts = Number(attemptsRaw ?? 0);

      if (attempts >= maxAttempts) {
        return {
          locked: true,
          retryAfterSeconds: ttl > 0 ? ttl : lockSeconds,
          attemptsRemaining: 0,
        };
      }
      return {
        locked: false,
        retryAfterSeconds: 0,
        attemptsRemaining: Math.max(0, maxAttempts - attempts),
      };
    } catch (error) {
      // Redis is down. Do not lock everyone out of their account — the rate
      // limiter is still in front of this path.
      logger.error('Brute-force check failed; allowing the attempt.', error);
      return unlocked;
    }
  }

  async function recordFailure(identifier: string): Promise<BruteForceStatus> {
    if (!redis) return unlocked;

    const key = identityKey(identifier);
    try {
      const attempts = await redis.incr(key);

      // Start the window on the first failure; extend to the lock duration at
      // the threshold so the penalty is a lock, not just a fading counter.
      if (attempts === 1) {
        await redis.expire(key, windowSeconds);
      } else if (attempts === maxAttempts) {
        await redis.expire(key, lockSeconds);
        logger.warn(`Identity locked after ${attempts} failed attempts (key=${key}).`);
      }

      const locked = attempts >= maxAttempts;
      return {
        locked,
        retryAfterSeconds: locked ? lockSeconds : 0,
        attemptsRemaining: Math.max(0, maxAttempts - attempts),
      };
    } catch (error) {
      logger.error('Could not record a failed attempt.', error);
      return unlocked;
    }
  }

  /** Call on successful authentication so a legitimate user is not punished. */
  async function reset(identifier: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.del(identityKey(identifier));
    } catch (error) {
      logger.error('Could not reset the failed-attempt counter.', error);
    }
  }

  return { check, recordFailure, reset };
}

/**
 * Constant-time string comparison.
 *
 * Use for tokens, OTPs and API keys. A plain `===` returns as soon as two bytes
 * differ, which leaks the position of the first mismatch and makes a secret
 * recoverable byte by byte over enough samples.
 */
export function safeEqual(a: string, b: string): boolean {
  // Compare digests so the lengths always match; timingSafeEqual throws otherwise,
  // and the throw itself would leak the length.
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}
