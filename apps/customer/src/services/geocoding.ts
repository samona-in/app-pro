import type { AddressSuggestion } from '@samona/types';
import { api } from './api';

/**
 * Address geocoding, proxied through our API.
 *
 * The apps never call a geocoder directly — search and reverse are served by
 * `GET /locations/search` and `GET /locations/reverse`, which wrap the OSM
 * provider behind the server's replaceable `GeocodingProvider` (CLAUDE.md
 * "Location"). This keeps third-party traffic on the server's terms and lets
 * the provider change without an app release.
 */
export const geocodingApi = {
  async search(q: string, limit = 6): Promise<AddressSuggestion[]> {
    const { data } = await api.get<{ data: AddressSuggestion[] }>('/locations/search', {
      query: { q, limit },
    });
    return data;
  },

  /** Returns null when no place covers the coordinate. */
  async reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
    const { data } = await api.get<{ data: AddressSuggestion | null }>('/locations/reverse', {
      query: { latitude, longitude },
    });
    return data;
  },
};