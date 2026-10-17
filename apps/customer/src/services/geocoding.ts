import type { AddressSuggestion } from '@samona/types';
import { api } from './api';

/**
 * Address geocoding, proxied through our API.
 *
 * The apps never call a geocoder directly — search, reverse and place details
 * are served by `GET /locations/*`, which wrap the Google provider behind the
 * server's replaceable `GeocodingProvider` (CLAUDE.md "Location"). This keeps
 * third-party traffic and the server key on the server's terms, and lets the
 * provider change without an app release.
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

  /**
   * Re-resolves a stored place id into a fresh suggestion.
   *
   * Used to refresh a saved address's display label on read without keeping
   * provider content cached indefinitely. Returns null when the id no longer
   * resolves, so the caller keeps the label it already has.
   */
  async resolvePlace(placeId: string): Promise<AddressSuggestion | null> {
    const { data } = await api.get<{ data: AddressSuggestion | null }>(
      `/locations/place/${encodeURIComponent(placeId)}`,
    );
    return data;
  },
};