/** Default timeout for a single API request, in milliseconds. */
export const DEFAULT_API_TIMEOUT_MS = 15_000;

/** Longer budget for uploads (documents, avatars). */
export const UPLOAD_API_TIMEOUT_MS = 60_000;

/** Keys used with Expo Secure Store. Centralised so they never drift. */
export const SECURE_STORE_KEYS = {
  accessToken: 'samona.auth.accessToken',
  refreshToken: 'samona.auth.refreshToken',
} as const;

/**
 * Number of digits in the SMS verification code.
 *
 * This must match the OTP length configured in the identity provider — for
 * Twilio Verify that is the Verify Service's code length, otherwise it is
 * Supabase Auth's phone provider setting. If they disagree, the app will refuse
 * a code the provider considers valid.
 *
 * Shorter codes are easier to type and easier to guess: four digits is 10,000
 * combinations against 1,000,000 for six. The provider's attempt limit and code
 * expiry are what keep that safe, so keep both tight.
 */
export const OTP_LENGTH = 4;

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
