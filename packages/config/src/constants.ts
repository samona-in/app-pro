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

/**
 * Which surface a client is speaking for.
 *
 * Sent with REST requests and the socket handshake; the server provisions the
 * matching profile for new identities. Roles still come from the database, not
 * from this value (CLAUDE.md "Authentication").
 */
export const APP_TYPES = {
  PRO: 'pro',
  CUSTOMER: 'customer',
} as const;

export type AppType = (typeof APP_TYPES)[keyof typeof APP_TYPES];

/** Socket.IO namespace path; must match the gateway in `server/src/realtime`. */
export const REALTIME_PATH = '/realtime';

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

/**
 * Defaults for the jobs domain (the deployed `jobs` model).
 *
 * The live schema carries the lifecycle with no TTL fields, so most of the
 * earlier dispatch knobs are gone. What remains are presentation defaults
 * shared by the server and the clients.
 */
export const JOB_DEFAULTS = {
  /** Assumed en-route speed used to derive ETA from distance, km/h. */
  etaSpeedKmh: 30,
  /** Cap on the pro app's available-jobs pool and job lists. */
  listLimit: 50,
  /**
   * How close (in metres) a pro's live location must be to the work spot
   * before they may "Start Work". Tune later from field feedback.
   */
  arrivalRadiusMeters: 250,
  /**
   * The one-time start-work verification code a pro must enter (read from the
   * customer) before the job may leave ARRIVED. One job, one code, no expiry.
   */
  startOtpLength: 4,
  /**
   * Wrong start-code entries allowed before the job's verify is locked out per
   * identity (Redis-backed), matching the brute-force guard defaults.
   */
  startOtpMaxAttempts: 5,
} as const;
