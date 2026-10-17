import { ApiErrorCode, type AddressSuggestion } from '@samona/types';
import { createHttpError, isHttpError } from '../common/errors';
import { logger } from '../common/logger';

/**
 * Geocoding behind one replaceable interface.
 *
 * The apps never talk to a geocoder directly: everything goes through the
 * `/locations` proxy, and everything the proxy knows about the outside world
 * lives behind `GeocodingProvider`. Google (Places API v1 + the Geocoding API)
 * is the adapter; a different provider would simply add another factory without
 * the routes, service, app or repackaging ever changing (CLAUDE.md "Location").
 */
export interface GeocodingProvider {
  search(query: string, limit: number): Promise<AddressSuggestion[]>;
  reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null>;
  /**
   * Resolves a durable place id back into a fresh suggestion. Backs the
   * "store the id, re-resolve the label on read" model for saved addresses.
   */
  details(placeId: string): Promise<AddressSuggestion | null>;
}

export interface GeocodingProviderDeps {
  /** Server-side Google Maps key. Never shipped to a client. */
  apiKey: string;
  /** Geocoding API endpoint (reverse lookup). */
  geocodingBaseUrl: string;
  /** Places API (New) base, e.g. https://places.googleapis.com/v1. */
  placesBaseUrl: string;
  /** Per-request timeout; swallowed by a 502 so a hung provider never stalls a request. */
  timeoutMs: number;
}

export interface JsonFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Fetches a JSON payload with a hard timeout. Any non-2xx is surfaced as an
 * error so `withGeocodingGuard` can translate provider trouble into a 502.
 */
export async function fetchJson(
  url: string,
  deps: Pick<GeocodingProviderDeps, 'timeoutMs'>,
  init: JsonFetchInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      body: init.body,
      signal: controller.signal,
      headers: { accept: 'application/json', ...init.headers },
    });
    if (!response.ok) {
      throw new Error(`Geocoder responded with HTTP ${response.status}.`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
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

/** One address component, normalized across the two Google response shapes. */
interface AddressComponent {
  types: string[];
  long: string | null;
  short: string | null;
}

/** Provider-neutral parts a suggestion is assembled from. */
interface PlaceParts {
  placeId: string | null;
  /** A place name ("Benz Circle"), when the provider supplies one. */
  name: string | null;
  /** A provider-formatted full address, when it supplies one. */
  formattedAddress: string | null;
  streetNumber: string | null;
  route: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
}

/** Returns the first component whose `types` include `type`, in `types` order. */
function componentValue(components: AddressComponent[], types: string[]): string | null {
  for (const type of types) {
    const match = components.find((component) => component.types.includes(type));
    if (match) {
      const value = match.long ?? match.short;
      if (value) return value;
    }
  }
  return null;
}

/**
 * Assembles the display shape from provider-neutral parts, mirroring the
 * provider-agnostic contract the client renders (`mainLabel` + `secondary`).
 */
function buildSuggestion(parts: PlaceParts): AddressSuggestion {
  const name = parts.name?.trim() ?? '';
  const streetLine = joinUnique([parts.streetNumber, parts.route]);
  // Drop any area part that merely repeats the place name (Google often echoes
  // the display name as the sublocality too).
  const areaLine = joinUnique(
    [parts.locality, parts.city, parts.state, parts.postalCode].filter(
      (part) => part?.trim() && part.trim() !== name,
    ),
  );

  const mainLabel = name || streetLine || areaLine || 'Pinned location';
  const formattedAddress =
    parts.formattedAddress?.trim() ||
    (mainLabel || areaLine ? joinUnique([mainLabel, areaLine]) : 'Pinned location');
  const secondary = areaLine && areaLine !== mainLabel ? areaLine : null;

  return {
    formattedAddress,
    mainLabel,
    secondary,
    locality: parts.locality,
    city: parts.city,
    state: parts.state,
    postalCode: parts.postalCode,
    latitude: parts.latitude,
    longitude: parts.longitude,
    placeId: parts.placeId,
  };
}

/** Derives the structured fields common to both adapters from components. */
function structuredFromComponents(components: AddressComponent[]) {
  return {
    streetNumber: componentValue(components, ['street_number']),
    route: componentValue(components, ['route', 'premise', 'subpremise']),
    locality: componentValue(components, [
      'sublocality_level_1',
      'sublocality',
      'neighborhood',
      'postal_town',
    ]),
    city: componentValue(components, ['locality', 'administrative_area_level_2']),
    state: componentValue(components, ['administrative_area_level_1']),
    postalCode: componentValue(components, ['postal_code']),
  };
}

// ── Places API (New) ─────────────────────────────────────────────────────────

interface PlacesComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesComponent[];
  location?: { latitude?: number; longitude?: number };
}

interface PlacesSearchResponse {
  places?: PlacesPlace[];
}

/** The fields we read must be requested explicitly in the Places API (New). */
const PLACES_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location';

const PLACE_DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,addressComponents,location';

function placesComponents(list: PlacesComponent[] | undefined): AddressComponent[] {
  return (list ?? []).map((component) => ({
    types: component.types ?? [],
    long: component.longText?.trim() || null,
    short: component.shortText?.trim() || null,
  }));
}

function fromPlace(place: PlacesPlace): AddressSuggestion | null {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (latitude == null || longitude == null) return null;

  return buildSuggestion({
    placeId: place.id ?? null,
    name: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    ...structuredFromComponents(placesComponents(place.addressComponents)),
    latitude,
    longitude,
  });
}

// ── Geocoding API (reverse) ──────────────────────────────────────────────────

interface GeocodeAddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GeocodeResult {
  place_id?: string;
  formatted_address?: string;
  address_components?: GeocodeAddressComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
}

interface GeocodeResponse {
  status?: string;
  results?: GeocodeResult[];
  error_message?: string;
}

function geocodeComponents(list: GeocodeAddressComponent[] | undefined): AddressComponent[] {
  return (list ?? []).map((component) => ({
    types: component.types ?? [],
    long: component.long_name?.trim() || null,
    short: component.short_name?.trim() || null,
  }));
}

function fromGeocodeResult(result: GeocodeResult): AddressSuggestion | null {
  const latitude = result.geometry?.location?.lat;
  const longitude = result.geometry?.location?.lng;
  if (latitude == null || longitude == null) return null;

  return buildSuggestion({
    placeId: result.place_id ?? null,
    name: null,
    formattedAddress: result.formatted_address ?? null,
    ...structuredFromComponents(geocodeComponents(result.address_components)),
    latitude,
    longitude,
  });
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * A Google-backed geocoder: forward search and place details via the Places API
 * (New), reverse geocoding via the Geocoding API.
 *
 * A missing key is not fatal at construction time (tests and keyless local
 * boots still start); any actual lookup then fails into the guard as a clean 502.
 */
export function createGoogleGeocoder(deps: GeocodingProviderDeps): GeocodingProvider {
  const { apiKey, geocodingBaseUrl, placesBaseUrl, timeoutMs } = deps;

  function requireKey(): string {
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured; geocoding is unavailable.');
    }
    return apiKey;
  }

  async function search(query: string, limit: number): Promise<AddressSuggestion[]> {
    const payload = (await fetchJson(
      `${placesBaseUrl}/places:searchText`,
      { timeoutMs },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': requireKey(),
          'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: Math.min(Math.max(limit, 1), 20),
          languageCode: 'en',
        }),
      },
    )) as PlacesSearchResponse;

    return (payload.places ?? [])
      .map(fromPlace)
      .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null);
  }

  async function reverse(latitude: number, longitude: number): Promise<AddressSuggestion | null> {
    const url = new URL(geocodingBaseUrl);
    url.searchParams.set('latlng', `${latitude},${longitude}`);
    url.searchParams.set('language', 'en');
    url.searchParams.set('key', requireKey());

    const payload = (await fetchJson(url.toString(), { timeoutMs })) as GeocodeResponse;
    const status = payload.status;
    if (status === 'ZERO_RESULTS') return null;
    if (status && status !== 'OK') {
      throw new Error(`Geocoding API responded with status ${status}.`);
    }

    const top = payload.results?.[0];
    if (!top) return null;
    return fromGeocodeResult(top);
  }

  async function details(placeId: string): Promise<AddressSuggestion | null> {
    const payload = (await fetchJson(
      `${placesBaseUrl}/places/${encodeURIComponent(placeId)}?languageCode=en`,
      { timeoutMs },
      {
        headers: {
          'X-Goog-Api-Key': requireKey(),
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
        },
      },
    )) as PlacesPlace;

    return fromPlace(payload);
  }

  return { search, reverse, details };
}

/**
 * Wraps a provider call so an unhealthy provider (network, 5xx, timeout) becomes
 * a clean 502 instead of an unexpected-error 500. Logged here, not leaked.
 */
export async function withGeocodingGuard<T>(
  label: 'search' | 'reverse' | 'details',
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // A provider-level HttpError carries a status worth keeping; anything else
    // is an unhealthy provider -> clean 502.
    if (isHttpError(error)) throw error;
    logger.error(`[Geocoding] ${label} failed.`, error);
    throw createHttpError(
      502,
      ApiErrorCode.INTERNAL,
      'Location lookup is temporarily unavailable.',
    );
  }
}
