import type { AddressSuggestion } from '@samona/types';
import type { Redis } from '../database/redis';
import { logger } from '../common/logger';

/**
 * A small read-through cache in front of the geocoder.
 *
 * Google bills per call and its terms only permit caching geocoding content for
 * a bounded window, so the durable identity is the place id (stored in
 * PostgreSQL) while the resolved label lives here under a short TTL. Reverse
 * lookups fire on every map settle, so caching them is what keeps the paid call
 * volume bounded. Redis is ephemeral by design; a miss or an outage simply falls
 * through to a live lookup (CLAUDE.md "Realtime").
 */
export interface GeocodeCache {
  /** The cached suggestion, `null` for a cached "no result", or `undefined` on a miss. */
  get(key: string): Promise<AddressSuggestion | null | undefined>;
  set(key: string, value: AddressSuggestion | null): Promise<void>;
}

/** ~1 m precision — enough to dedupe repeated reverse lookups for one pin. */
export function reverseCacheKey(latitude: number, longitude: number): string {
  return `geo:reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function placeCacheKey(placeId: string): string {
  return `geo:place:${placeId}`;
}

export function createGeocodeCache(redis: Redis | null, ttlMs: number): GeocodeCache {
  return {
    async get(key) {
      if (!redis) return undefined;
      try {
        const raw = await redis.get(key);
        if (raw === null) return undefined;
        // Wrapped so a cached "no result" (null) is distinguishable from a miss.
        const parsed = JSON.parse(raw) as { v: AddressSuggestion | null };
        return parsed.v ?? null;
      } catch (error) {
        logger.warn(`[Geocoding] cache read failed for ${key}.`, error);
        return undefined;
      }
    },

    async set(key, value) {
      if (!redis) return;
      try {
        await redis.set(key, JSON.stringify({ v: value }), 'PX', ttlMs);
      } catch (error) {
        logger.warn(`[Geocoding] cache write failed for ${key}.`, error);
      }
    },
  };
}
