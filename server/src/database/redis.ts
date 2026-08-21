import Redis from 'ioredis';

/**
 * Creates the shared Redis connection.
 *
 * Intended for ephemeral state — pro presence, matching locks, rate limits,
 * Socket.IO scale-out. Durable state belongs in PostgreSQL: Redis never becomes
 * the source of truth (CLAUDE.md "Realtime").
 *
 * `lazyConnect` keeps construction side-effect free; `connect()` is called
 * during startup so a failure surfaces there rather than mid-request.
 */
export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}

export type { Redis };
