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
  /** Base URL advertised by the provider, e.g. https://photon.komoot.io. */
  baseUrl: string;
  /** Per-request timeout; swallowed by a 502 so a hung provider never stalls a request. */
  timeoutMs: number;
}

/**
 * Fetches a JSON payload with a hard timeout. Any non-2xx is surfaced as an
 * error so `withGeocodingGuard` can translate provider trouble into a 502.
 */
export async function fetchJson(
  url: string,
  deps: Pick<GeocodingProviderDeps, 'timeoutMs'>,
  headers?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...headers },
    });
    if (!response.ok) {
      throw new Error(`Geocoder responded with HTTP ${response.status}.`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
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
    const payload = await fetchJson(url, { timeoutMs });
    return featuresOf(payload)
      .map(toSuggestion)
      .filter((s): s is AddressSuggestion => s !== null);
  }

  async function reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
    const url = `${baseUrl}/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
    const features = featuresOf(await fetchJson(url, { timeoutMs }));
    const top = features[0];
    if (!top) return null;
    const suggestion = toSuggestion(top);
    return suggestion;
  }

  return { search, reverse };
}

/** One place as Nominatim's `/search` and `/reverse` (jsonv2) return it. */
interface NominatimPlace {
  display_name?: string;
  name?: string | null;
  lat?: string | number;
  lon?: string | number;
  address?: Record<string, string | undefined>;
}

function nominatimToSuggestion(place: NominatimPlace): AddressSuggestion | null {
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const addr = place.address ?? {};
  const locality = addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? null;
  const city = addr.city ?? null;
  const state = addr.state ?? null;
  const postalCode = addr.postcode ?? null;

  const streetLine = joinUnique([addr.house_number, addr.road ?? addr.pedestrian ?? addr.footway]);
  const areaLine = joinUnique([locality, city, state, postalCode]);
  const name = place.name?.trim() ?? '';

  const mainLabel = name || streetLine || areaLine || 'Pinned location';
  const formattedAddress =
    place.display_name?.trim() ||
    (mainLabel || areaLine ? joinUnique([mainLabel, areaLine]) : 'Pinned location');
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

/**
 * A Nominatim-backed geocoder (https://nominatim.openstreetmap.org).
 *
 * Used as the automatic fallback when the primary provider is unreachable.
 * Sends a descriptive `User-Agent` as Nominatim's policy requires; keep
 * outbound volume lowly (their shared instance allows ~1 req/s).
 */
export function createNominatimGeocoder(deps: GeocodingProviderDeps): GeocodingProvider {
  const { baseUrl, timeoutMs } = deps;
  const userAgent = 'SAMONA/0.1 (address lookup proxy; https://samona.in)';

  const headers = { 'user-agent': userAgent };

  async function search(query: string, limit: number): Promise<AddressSuggestion[]> {
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}&format=jsonv2&accept-language=en`;
    const payload = await fetchJson(url, { timeoutMs }, headers);
    const places = Array.isArray(payload) ? (payload as NominatimPlace[]) : [];
    return places.map(nominatimToSuggestion).filter((s): s is AddressSuggestion => s !== null);
  }

  async function reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
    const url = `${baseUrl}/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&format=jsonv2&accept-language=en`;
    const place = (await fetchJson(url, { timeoutMs }, headers)) as NominatimPlace | null;
    if (!place || typeof place !== 'object') return null;
    return nominatimToSuggestion(place);
  }

  return { search, reverse };
}

/**
 * Tries providers in order, so a down primary (Photon's shared public
 * instance) degrades gracefully to a configured fallback instead of failing
 * every request. Only thrown errors fail over; a definitive "no result" from a
 * healthy provider is passed through. Each skipped provider is logged.
 */
export function createFailoverGeocoder(providers: GeocodingProvider[]): GeocodingProvider {
  if (providers.length === 0) {
    throw new Error('createFailoverGeocoder requires at least one provider.');
  }

  async function tryEach<T>(
    label: 'search' | 'reverse',
    run: (provider: GeocodingProvider) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    const count = providers.length;
    let attempted = 0;
    for (const provider of providers) {
      attempted++;
      try {
        return await run(provider);
      } catch (error) {
        lastError = error;
        const tail = attempted < count ? ', trying the next one.' : '.';
        logger.warn(`[Geocoding] ${label}: provider unavailable${tail}`, error);
      }
    }
    throw lastError;
  }

  return {
    search: (query, limit) => tryEach('search', (provider) => provider.search(query, limit)),
    reverse: (latitude, longitude) =>
      tryEach('reverse', (provider) => provider.reverse(latitude, longitude)),
  };
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
    throw createHttpError(
      502,
      ApiErrorCode.INTERNAL,
      'Location lookup is temporarily unavailable.',
    );
  }
}
