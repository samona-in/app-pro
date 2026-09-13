import path from 'node:path';
import { z } from 'zod';

/**
 * Environment schema.
 *
 * The process fails fast at boot if anything is missing or malformed — a
 * misconfigured server should never start and serve broken requests.
 */
/**
 * Treats an empty string as "not set".
 *
 * `.env.example` ships optional values as `FOO=""`, and dotenv reads that as an
 * empty string rather than an absent key. Without this, an untouched optional
 * URL fails validation and the server refuses to start.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /**
   * Supabase connection string. Use the *pooled* (Supavisor, port 6543) URL at
   * runtime — direct Postgres connections are exhausted quickly under load.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  /**
   * Direct (port 5432) connection, used only by `prisma migrate`. Migrations
   * need a real session; they cannot run through a transaction pooler.
   */
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for migrations.'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required.'),

  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  SUPABASE_URL: z.url({ message: 'SUPABASE_URL must be a valid URL.' }),

  /**
   * JWKS endpoint used to verify access tokens. Optional: it is derived from
   * SUPABASE_URL when omitted. Set it only if the project publishes keys
   * somewhere non-standard.
   */
  SUPABASE_JWKS_URL: optional(z.url()),

  /**
   * Legacy HS256 signing secret. Optional: newer Supabase projects sign with
   * asymmetric keys and publish a JWKS instead, which needs no shared secret.
   * Set this only if the project still uses the legacy shared secret.
   */
  SUPABASE_JWT_SECRET: optional(z.string()),

  /**
   * Secret API key (`sb_secret_...`). Bypasses row-level security, so it must
   * never reach a client. Only needed for administrative reads of `auth.users`;
   * ordinary requests are authorised by the caller's own token.
   */
  SUPABASE_SECRET_KEY: optional(z.string()),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default(''),

  GOOGLE_MAPS_API_KEY: optional(z.string()),

  /**
   * Base URL of the OSM-compatible geocoder the `/locations` proxy calls.
   * Photon (keyless, OSM data) is the default; self-host it in production
   * rather than depending on the shared public instance.
   */
  GEOCODING_BASE_URL: z
    .url({ message: 'GEOCODING_BASE_URL must be a valid URL.' })
    .default('https://photon.komoot.io'),

  /**
   * Per-request timeout for geocoder calls, in ms. A hung provider surfaces as
   * a 502 instead of stalling a request forever.
   */
  GEOCODING_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),

  /**
   * OSM Nominatim-compatible fallback geocoder. When different from
   * `GEOCODING_BASE_URL`, requests the primary provider cannot serve fail over
   * to this one, so a down Photon instance does not break address lookup.
   * Defaults to the shared Nominatim instance; set it equal to
   * `GEOCODING_BASE_URL` to disable failover.
   */
  GEOCODING_FALLBACK_URL: z
    .url({ message: 'GEOCODING_FALLBACK_URL must be a valid URL.' })
    .default('https://nominatim.openstreetmap.org'),

  /**
   * Expo push service access token. Optional: when unset the server still
   * records notification rows but does not reach Expo's servers (useful in
   * local dev). Get one at https://expo.dev/settings/access-tokens.
   */
  EXPO_ACCESS_TOKEN: optional(z.string()),

  /**
   * How often a repeating job alert is re-sent to an online, eligible pro who
   * has not yet acted, while the job is still open. Defaults to 60s.
   */
  JOB_ALERT_REPEAT_MS: z.coerce.number().int().min(5_000).max(600_000).default(60_000),

  /**
   * Hard ceiling on repeats for one job alert before the server stops paging.
   * Guards against a job that is never accepted/expired paging a pro forever.
   */
  JOB_ALERT_MAX_REPEATS: z.coerce.number().int().min(0).max(100).default(0),

  /**
   * How far back a still-open job request is still offered to a pro who comes
   * online after the request was raised (Rapido-style catch-up). Defaults to
   * 2 hours.
   */
  JOB_CATCHUP_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(86_400_000)
    .default(2 * 60 * 60_000),

  /**
   * How many still-open requests, nearest first, a pro is paged for at once on
   * return to online. Guards against overwhelming a pro with a backlog.
   */
  JOB_CATCHUP_LIMIT: z.coerce.number().int().min(1).max(20).default(3),

  /**
   * How long an unaccepted (REQUESTED) job stays open before the sweep flips it
   * to EXPIRED. A job nobody accepts should not wait forever. Defaults to 30m.
   */
  JOB_EXPIRE_TTL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(86_400_000)
    .default(30 * 60_000),

  /**
   * How often the auto-expiry sweep scans for REQUESTED jobs older than the TTL.
   * Defaults to 60s; bounded below so a busy loop is impossible.
   */
  JOB_EXPIRE_SWEEP_MS: z.coerce.number().int().min(5_000).max(86_400_000).default(60_000),

  /**
   * Firebase Cloud Messaging service-account credentials, for direct FCM HTTP
   * v1 delivery of Android job alerts (TTL, per-job collapse key and
   * notification `tag`). All three are optional and must be set together; when
   * absent the server falls back to the Expo push service (and records rows
   * without reaching anyone when neither is configured).
   */
  FCM_PROJECT_ID: optional(z.string()),
  FCM_CLIENT_EMAIL: optional(z.string()),
  FCM_PRIVATE_KEY: optional(z.string()),

  /**
   * How long an FCM job-alert message stays deliverable, in ms. Sized a little
   * longer than the ring so a repeat push can still replace the tray entry, and
   * far shorter than JOB_EXPIRE_TTL_MS so a stale offer cannot come back hours
   * later. Defaults to 60s.
   */
  JOB_ALERT_TTL_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),

  /**
   * Shared secret that signs single-use job-offer tokens (native Accept/Reject
   * on the Android overlay). Optional but strongly recommended: when absent the
   * native overlay cannot call the API directly and falls back to opening the
   * app. Generate with `openssl rand -hex 32`. Never commit a real value.
   */
  JOB_OFFER_SECRET: optional(
    z.string().min(16, 'JOB_OFFER_SECRET must be at least 16 characters.'),
  ),

  /**
   * How long a minted job-offer token stays redeemable, in ms. A little longer
   * than JOB_ALERT_TTL_MS (the message TTL) so a delivered offer is never
   * already dead, and far shorter than JOB_EXPIRE_TTL_MS — an offer must not
   * outlive the request it belongs to. Defaults to 90s.
   */
  JOB_OFFER_TTL_MS: z.coerce.number().int().min(5_000).max(600_000).default(90_000),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  isProduction: boolean;
  databaseUrl: string;
  directUrl: string;
  redisUrl: string;
  supabaseUrl: string;
  supabaseJwtSecret: string | null;
  supabaseJwksUrl: string | null;
  supabaseSecretKey: string | null;
  corsOrigins: string[];
  googleMapsApiKey: string | null;
  /** Base URL of the OSM-compatible geocoder used by `/locations`. */
  geocodingBaseUrl: string;
  /** Per-request geocoder timeout, in ms. */
  geocodingTimeoutMs: number;
  /** Nominatim-compatible fallback geocoder; null disables failover. */
  geocodingFallbackUrl: string | null;
  /** Expo push service access token; null disables outbound pushes. */
  expoAccessToken: string | null;
  /** Repeating job-alert cadence, in ms. */
  jobAlertRepeatMs: number;
  /** Ceiling on repeats for a single job alert. */
  jobAlertMaxRepeats: number;
  /** Catch-up recency window for a pro returning online, in ms. */
  jobCatchupWindowMs: number;
  /** Nearest-first cap of open requests paged to a returning pro. */
  jobCatchupLimit: number;
  /** How long an unaccepted job stays open before auto-expiring, in ms. */
  jobExpireTtlMs: number;
  /** How often the auto-expiry sweep runs, in ms. */
  jobExpireSweepMs: number;
  /** Firebase Cloud Messaging service-account email; null disables FCM. */
  fcmClientEmail: string | null;
  /** Firebase Cloud Messaging service-account private key; null disables FCM. */
  fcmPrivateKey: string | null;
  /** Firebase Cloud Messaging project id; null disables FCM. */
  fcmProjectId: string | null;
  /** How long an FCM job-alert message stays deliverable, in ms. */
  jobAlertTtlMs: number;
  /** Secret signing single-use job-offer tokens; null disables native direct accept. */
  jobOfferSecret: string | null;
  /** How long a minted job-offer token stays redeemable, in ms. */
  jobOfferTtlMs: number;
}

/**
 * Loads the monorepo's root `.env`, if present.
 *
 * Uses Node's built-in loader rather than a dotenv dependency. A missing file
 * is fine — real deployments inject variables through the environment.
 */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '..', '..', '.env'));
  } catch {
    // No local .env; see .env.example.
  }
}

/**
 * Validates `process.env` and shapes it into typed config.
 *
 * Application code receives this through the app context and never reads
 * `process.env` directly.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    isProduction: env.NODE_ENV === 'production',
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL,
    redisUrl: env.REDIS_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET ?? null,
    supabaseJwksUrl: env.SUPABASE_JWKS_URL ?? null,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY ?? null,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY ?? null,
    geocodingBaseUrl: env.GEOCODING_BASE_URL,
    geocodingTimeoutMs: env.GEOCODING_TIMEOUT_MS,
    geocodingFallbackUrl: env.GEOCODING_FALLBACK_URL ?? null,
    expoAccessToken: env.EXPO_ACCESS_TOKEN ?? null,
    jobAlertRepeatMs: env.JOB_ALERT_REPEAT_MS,
    jobAlertMaxRepeats: env.JOB_ALERT_MAX_REPEATS,
    jobCatchupWindowMs: env.JOB_CATCHUP_WINDOW_MS,
    jobCatchupLimit: env.JOB_CATCHUP_LIMIT,
    jobExpireTtlMs: env.JOB_EXPIRE_TTL_MS,
    jobExpireSweepMs: env.JOB_EXPIRE_SWEEP_MS,
    fcmProjectId: env.FCM_PROJECT_ID ?? null,
    fcmClientEmail: env.FCM_CLIENT_EMAIL ?? null,
    fcmPrivateKey: env.FCM_PRIVATE_KEY ?? null,
    jobAlertTtlMs: env.JOB_ALERT_TTL_MS,
    jobOfferSecret: env.JOB_OFFER_SECRET ?? null,
    jobOfferTtlMs: env.JOB_OFFER_TTL_MS,
  };
}
