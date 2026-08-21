/** Default timeout for a single API request, in milliseconds. */
export const DEFAULT_API_TIMEOUT_MS = 15_000;

/** Longer budget for uploads (documents, avatars). */
export const UPLOAD_API_TIMEOUT_MS = 60_000;

/** Keys used with Expo Secure Store. Centralised so they never drift. */
export const SECURE_STORE_KEYS = {
  accessToken: 'samona.auth.accessToken',
  refreshToken: 'samona.auth.refreshToken',
} as const;

/** API route prefix; kept here so client and server agree on one value. */
export const API_PREFIX = '/api/v1';

/** Location defaults for the Pro app's service-radius feature. */
export const LOCATION_DEFAULTS = {
  /** Default radius a professional serves, in kilometres. */
  serviceRadiusKm: 10,
  minServiceRadiusKm: 1,
  maxServiceRadiusKm: 50,
  /** Minimum movement before a location update is worth sending, in metres. */
  updateDistanceIntervalM: 50,
  /** Minimum time between location updates, in milliseconds. */
  updateTimeIntervalMs: 15_000,
} as const;
