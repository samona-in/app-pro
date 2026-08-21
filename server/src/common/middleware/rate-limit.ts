import rateLimit, {
  ipKeyGenerator,
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { ApiErrorCode, type ApiErrorBody } from '@samona/types';
import type { Redis } from '../../database/redis';
import { logger } from '../logger';

/**
 * Rate limiting.
 *
 * Counters live in Redis so every instance of the API shares one budget —
 * per-process counters would let an attacker multiply their allowance by the
 * number of instances behind the load balancer.
 *
 * If Redis is unavailable the limiters fall back to per-process memory rather
 * than switching themselves off. Degraded protection beats none: failing open
 * is how a cache outage becomes a credential-stuffing window.
 */

export interface RateLimiterDeps {
  redis: Redis | null;
  /** Disables limiting. Only ever true in tests asserting unrelated behaviour. */
  disabled?: boolean;
}

/**
 * Identifies the caller.
 *
 * Authenticated requests are keyed by user id, so one abusive account cannot
 * hide behind a rotating IP and users sharing a carrier NAT do not consume each
 * other's budget. Anonymous requests fall back to IP, normalised through
 * `ipKeyGenerator` so an IPv6 client cannot cycle addresses within its own /64.
 */
function callerKey(req: Request): string {
  const userId = req.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
}

/** Responds with the shared API error envelope plus Retry-After. */
function limitExceeded(message: string) {
  return (req: Request, res: Response): void => {
    const resetHeader = res.getHeader('RateLimit-Reset');
    const retryAfterSeconds = Math.max(1, Number(resetHeader) || 60);
    const requestId = req.get('x-request-id');

    logger.warn(
      `Rate limit hit: ${req.method} ${req.originalUrl} by ${callerKey(req)} ` +
        `(requestId=${requestId ?? 'none'})`,
    );

    res.setHeader('Retry-After', String(retryAfterSeconds));

    const body: ApiErrorBody = {
      error: {
        code: ApiErrorCode.RATE_LIMITED,
        message,
        ...(requestId ? { requestId } : {}),
      },
    };
    res.status(429).json(body);
  };
}

function buildStore(redis: Redis | null, prefix: string) {
  if (!redis) {
    logger.warn(
      `Rate limiter "${prefix}" is using in-process memory: counters are not shared ` +
        'across instances. Restore Redis to make limits cluster-wide.',
    );
    // Returning undefined lets express-rate-limit use its MemoryStore.
    return undefined;
  }

  return new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis exposes `call`; rate-limit-redis only needs a command runner.
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<never>,
  });
}

interface LimiterSpec extends Pick<Options, 'windowMs' | 'limit'> {
  message: string;
  /** Only count failures — used where success is cheap and failure is the attack. */
  skipSuccessful?: boolean;
}

function createLimiter(
  deps: RateLimiterDeps,
  prefix: string,
  spec: LimiterSpec,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.limit,
    // Draft-8 `RateLimit` headers; the legacy X-RateLimit-* set leaks more detail.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: callerKey,
    handler: limitExceeded(spec.message),
    skip: () => deps.disabled === true,
    skipSuccessfulRequests: spec.skipSuccessful ?? false,
    store: buildStore(deps.redis, prefix),
  });
}

/**
 * Baseline budget for every request.
 *
 * Sized to be invisible to a professional using the app normally, while making
 * scraping and blind enumeration slow enough to be pointless.
 */
export const createGlobalLimiter = (deps: RateLimiterDeps) =>
  createLimiter(deps, 'global', {
    windowMs: 60_000,
    limit: 300,
    message: 'Too many requests. Please slow down and try again shortly.',
  });

/**
 * Credential endpoints: sign-in, OTP request, OTP verify, password reset.
 *
 * Deliberately tight — this is the surface credential stuffing and OTP brute
 * force attack. `skipSuccessful` means a legitimate user signing in first time
 * barely touches the budget, while repeated failures burn it fast.
 */
export const createAuthLimiter = (deps: RateLimiterDeps) =>
  createLimiter(deps, 'auth', {
    windowMs: 15 * 60_000,
    limit: 10,
    message: 'Too many attempts. Please wait a few minutes before trying again.',
    skipSuccessful: true,
  });

/** Writes are more expensive and more abusable than reads. */
export const createWriteLimiter = (deps: RateLimiterDeps) =>
  createLimiter(deps, 'write', {
    windowMs: 60_000,
    limit: 60,
    message: 'Too many changes in a short time. Please slow down.',
  });

/**
 * Costly operations: geocoding, matching sweeps, uploads, payment intents.
 *
 * These fan out to paid third parties or heavy queries, so abuse here costs
 * real money rather than just CPU.
 */
export const createExpensiveLimiter = (deps: RateLimiterDeps) =>
  createLimiter(deps, 'expensive', {
    windowMs: 60_000,
    limit: 20,
    message: 'This action is temporarily limited. Please try again in a minute.',
  });

/**
 * High-frequency telemetry: a pro's location while travelling to a job.
 *
 * Allows headroom over the client's `LOCATION_DEFAULTS` cadence, and no more.
 */
export const createLocationLimiter = (deps: RateLimiterDeps) =>
  createLimiter(deps, 'location', {
    windowMs: 60_000,
    limit: 40,
    message: 'Location updates are being sent too quickly.',
  });

/** Every limiter, built once at startup and shared across requests. */
export interface Limiters {
  global: RateLimitRequestHandler;
  auth: RateLimitRequestHandler;
  write: RateLimitRequestHandler;
  expensive: RateLimitRequestHandler;
  location: RateLimitRequestHandler;
}

export function createLimiters(deps: RateLimiterDeps): Limiters {
  return {
    global: createGlobalLimiter(deps),
    auth: createAuthLimiter(deps),
    write: createWriteLimiter(deps),
    expensive: createExpensiveLimiter(deps),
    location: createLocationLimiter(deps),
  };
}
