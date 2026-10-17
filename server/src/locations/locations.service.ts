import type { AddressSuggestion } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { withGeocodingGuard, type GeocodingProvider } from './geocoding';
import { placeCacheKey, reverseCacheKey, type GeocodeCache } from './cache';

export interface LocationsServiceDeps {
  prisma: PrismaClient;
  /** The replaceable geocoder (Google by default). */
  geocoding: GeocodingProvider;
  /** Read-through cache that bounds paid provider calls. */
  cache: GeocodeCache;
}

/**
 * Locations domain service.
 *
 * Location capture, geocoding and proximity queries. Backs nearby-job
 * matching and live job tracking.
 *
 * Search delegates straight through; reverse and place-details are cached,
 * because both run at high frequency (every map settle, every saved-address
 * read) and both are metered provider calls.
 */
export function createLocationsService(deps: LocationsServiceDeps) {
  void deps.prisma;

  async function searchAddresses(query: string, limit: number): Promise<AddressSuggestion[]> {
    // Free-text queries are high cardinality and time-sensitive; not cached.
    return withGeocodingGuard('search', () => deps.geocoding.search(query, limit));
  }

  async function reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<AddressSuggestion | null> {
    const key = reverseCacheKey(latitude, longitude);
    const cached = await deps.cache.get(key);
    if (cached !== undefined) return cached;

    const fresh = await withGeocodingGuard('reverse', () =>
      deps.geocoding.reverse(latitude, longitude),
    );
    await deps.cache.set(key, fresh);
    return fresh;
  }

  /** Re-resolves a stored place id into a fresh suggestion for display. */
  async function placeDetails(placeId: string): Promise<AddressSuggestion | null> {
    const key = placeCacheKey(placeId);
    const cached = await deps.cache.get(key);
    if (cached !== undefined) return cached;

    const fresh = await withGeocodingGuard('details', () => deps.geocoding.details(placeId));
    await deps.cache.set(key, fresh);
    return fresh;
  }

  return { searchAddresses, reverseGeocode, placeDetails };
}

export type LocationsService = ReturnType<typeof createLocationsService>;
