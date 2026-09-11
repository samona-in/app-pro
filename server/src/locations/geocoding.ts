import { ApiErrorCode, type AddressSuggestion } from '@samona/types';
import { createHttpError, isHttpError } from '../common/errors';
import { logger } from '../common/logger';

/**
 * Geocoding behind one replaceable interface.
 *
 * The Customer app never talks to a geocoder directly: everything goes through
 * the `/locations` proxy, and everything the proxy knows about the outside
 * world lives behind `GeocodingProvider`. Photon (OSM data, keyless) is the
 * default adapter; Pelias or Nominatim simply add another factory without the
 * routes, service, app or repackaging ever changing (CLAUDE.md "Realtime" is a
 * proxy principle, but this is the "replaceable provider" one from the address
 * feature).
 */
export interface GeocodingProvider {
  search(query: string, limit: number): Promise<AddressSuggestion[]>;
  reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null>;
}

export interface GeocodingProviderDeps {
  /** Base URL of the Photon instance, e.g. https://photon.komoot.io. */
  baseUrl: string;
  /** Per-request timeout; swallowed by a 502 so a hung provider never stalls a request. */
  timeoutMs: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    type?: string;
    lat?: number;
    lon?: number;
  };
}

/** Joins parts into "a, b, c", skipping blanks and duplicates. */
function joinUnique(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(', ');
}

function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const props = feature.properties ?? {};
  const geom = feature.geometry?.coordinates;
  const longitude = props.lon ?? (geom?.[0] as number | undefined);
  const latitude = props.lat ?? (geom?.[1] as number | undefined);
  if (longitude == null || latitude == null) return null;

  const locality = props.locality ?? props.district ?? null;
  const city = props.city ?? null;
  const state = props.state ?? null;
  const postalCode = props.postcode ?? null;

  const streetLine = joinUnique([props.housenumber, props.street]);
  const areaLine = joinUnique([locality, city, state, postalCode]);
  const name = props.name?.trim() ?? '';

  const mainLabel = name || streetLine || areaLine || 'Pinned location';
  const formattedAddress =
    mainLabel || areaLine ? joinUnique([mainLabel, areaLine]) : 'Pinned location';
  const secondary = areaLine && areaLine !== mainLabel ? areaLine : null;

  return {
    formattedAddress,
    mainLabel,
    secondary,
    locality,
    city,
    state,
    postalCode,
    latitude,
    longitude,
  };
}

/** A Photon-backed geocoder (https://photon.komoot.io). */
export function createPhotonGeocoder(deps: GeocodingProviderDeps): GeocodingProvider {
  const { baseUrl, timeoutMs } = deps;

  async function requestJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Geocoder responded with HTTP ${response.status}.`);
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Normalizes either response shape Photon can return. */
  function featuresOf(payload: unknown): PhotonFeature[] {
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as { features?: PhotonFeature[]; type?: string };
    if (Array.isArray(record.features)) return record.features;
    if (record.type === 'Feature') return [record as PhotonFeature];
    return [];
  }

  async function search(query: string, limit: number): Promise<AddressSuggestion[]> {
    const url = `${baseUrl}/api/?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}&lang=en`;
    const payload = await requestJson(url);
    return featuresOf(payload)
      .map(toSuggestion)
      .filter((s): s is AddressSuggestion => s !== null);
  }

  async function reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
    const url = `${baseUrl}/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
    const features = featuresOf(await requestJson(url));
    const top = features[0];
    if (!top) return null;
    const suggestion = toSuggestion(top);
    return suggestion;
  }

  return { search, reverse };
}

/**
 * Wraps a provider call so an unhealthy provider (network, 5xx, timeout) becomes
 * a clean 502 instead of an unexpected-error 500. Logged here, not leaked.
 */
export async function withGeocodingGuard<T>(
  label: 'search' | 'reverse',
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // A provider-level HttpError (e.g. Photon answering 429) carries a status
    // worth keeping; anything else is an unhealthy provider -> clean 502.
    if (isHttpError(error)) throw error;
    logger.error(`[Geocoding] ${label} failed.`, error);
    throw createHttpError(502, ApiErrorCode.INTERNAL, 'Location lookup is temporarily unavailable.');
  }
}