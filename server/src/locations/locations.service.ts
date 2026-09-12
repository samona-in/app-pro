import type { AddressSuggestion } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import { withGeocodingGuard, type GeocodingProvider } from './geocoding';

export interface LocationsServiceDeps {
  prisma: PrismaClient;
  /** Replaceable OSM-backed geocoder (Photon by default). */
  geocoding: GeocodingProvider;
}

/**
 * Locations domain service.
 *
 * Location capture, geocoding and proximity queries. Backs nearby-job
 * matching and live job tracking.
 *
 * The geocoding surface is deliberately thin: search and reverse-geocode both
 * delegate to the injected provider, wrapped so an unhealthy provider surfaces
 * as a clean 502 rather than an unexpected-error 500.
 */
export function createLocationsService(deps: LocationsServiceDeps) {
  void deps.prisma;

  async function searchAddresses(query: string, limit: number): Promise<AddressSuggestion[]> {
    return withGeocodingGuard('search', () => deps.geocoding.search(query, limit));
  }

  async function reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<AddressSuggestion | null> {
    return withGeocodingGuard('reverse', () => deps.geocoding.reverse(latitude, longitude));
  }

  return { searchAddresses, reverseGeocode };
}

export type LocationsService = ReturnType<typeof createLocationsService>;