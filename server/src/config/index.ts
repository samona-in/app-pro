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
   * PostgreSQL connection string used at runtime. On RDS this is the instance
   * endpoint directly; if a transaction pooler (PgBouncer, Supavisor) is ever
   * put in front, point this at the pooler and set `pgbouncer=true`.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  /**
   * Direct (unpooled) connection, used only by `prisma migrate`. Optional:
   * migrations fall back to DATABASE_URL when it is unset, which is correct on
   * any deployment with no pooler in front. Only needed when DATABASE_URL points
   * at a pooler, since migrations require a real session.
   */
  DIRECT_URL: optional(z.string().min(1)),

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
   * Region the object buckets live in. Also determines the shape of a public
   * object URL, so it must match where the buckets actually are.
   */
  S3_REGION: z.string().min(1, 'S3_REGION is required.'),

  /** Bucket holding live-captured Pro face photos. */
  S3_BUCKET_SELFIES: z.string().min(1, 'S3_BUCKET_SELFIES is required.'),

  /** Bucket holding job reference photos. */
  S3_BUCKET_JOB_IMAGES: z.string().min(1, 'S3_BUCKET_JOB_IMAGES is required.'),

  /** Bucket holding per-surface profile avatars. */
  S3_BUCKET_AVATARS: z.string().min(1, 'S3_BUCKET_AVATARS is required.'),

  /**
   * Origin that public selfie URLs are built from. Optional: defaults to the
   * selfies bucket's own regional S3 URL.
   *
   * One origin per bucket, not one for all three. A CDN distribution fronts a
   * single bucket, so when we put CloudFront in front these have to differ —
   * `d123.cloudfront.net/selfies` and `d123.cloudfront.net/avatars` are two
   * distributions, not two prefixes on one. Sharing a single base URL would
   * have baked that mistake into the URL builder before we found out.
   */
  S3_PUBLIC_BASE_URL_SELFIES: optional(z.string()),

  /** Origin for public job-image URLs. See `S3_PUBLIC_BASE_URL_SELFIES`. */
  S3_PUBLIC_BASE_URL_JOB_IMAGES: optional(z.string()),

  /** Origin for public avatar URLs. See `S3_PUBLIC_BASE_URL_SELFIES`. */
  S3_PUBLIC_BASE_URL_AVATARS: optional(z.string()),

  /**
   * Custom S3-compatible endpoint for object storage — e.g. Supabase Storage's
   * S3 gateway (`https://<ref>.storage.supabase.co/storage/v1/s3`).
   *
   * Optional. Production talks to real AWS endpoints and resolves credentials
   * from the ambient provider chain, so no key material lives in the
   * environment. Local development against Supabase sets this together with
   * `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; all three are required as a
   * group.
   */
  S3_ENDPOINT: optional(z.url({ message: 'S3_ENDPOINT must be a valid URL.' })),

  /** Access key id for an S3-compatible endpoint. Only for local/dev. */
  S3_ACCESS_KEY_ID: optional(z.string().min(1, 'S3_ACCESS_KEY_ID must not be empty.')),

  /** Secret access key for an S3-compatible endpoint. Only for local/dev. */
  S3_SECRET_ACCESS_KEY: optional(z.string().min(1, 'S3_SECRET_ACCESS_KEY must not be empty.')),

  /**
   * Whether to address buckets by path (`<endpoint>/<bucket>/<key>`) rather
   * than virtual-host style. S3-compatible endpoints require path-style, so
   * this defaults to true; only meaningful alongside `S3_ENDPOINT`.
   */
  S3_FORCE_PATH_STYLE: optional(z.enum(['true', 'false'])),

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
   * Minimum gap between two alerts to the same pro for the same job, in ms.
   * Applied when a job returns to the open pool after a pro releases it: a pro
   * who was just alerted is not bombarded again until this window has passed.
   * Defaults to 5 minutes.
   */
  JOB_ALERT_REARM_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(3_600_000)
    .default(5 * 60_000),

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
  /** Unpooled connection for migrations; null when DATABASE_URL is used directly. */
  directUrl: string | null;
  redisUrl: string;
  supabaseUrl: string;
  supabaseJwtSecret: string | null;
  supabaseJwksUrl: string | null;
  /** Region the object buckets live in. */
  s3Region: string;
  /** Bucket holding live-captured Pro face photos. */
  s3BucketSelfies: string;
  /** Bucket holding job reference photos. */
  s3BucketJobImages: string;
  /** Bucket holding per-surface profile avatars. */
  s3BucketAvatars: string;
  /** Origin for public selfie URLs; null uses the selfies bucket's S3 URL. */
  s3PublicBaseUrlSelfies: string | null;
  /** Origin for public job-image URLs; null uses that bucket's S3 URL. */
  s3PublicBaseUrlJobImages: string | null;
  /** Origin for public avatar URLs; null uses the avatars bucket's S3 URL. */
  s3PublicBaseUrlAvatars: string | null;
  /**
   * Custom S3-compatible endpoint (Supabase, MinIO); null uses real AWS
   * endpoints and the ambient credential chain.
   */
  s3Endpoint: string | null;
  /** Access keys for a custom endpoint; null means resolve from the chain. */
  s3Credentials: { accessKeyId: string; secretAccessKey: string } | null;
  /** Path-style bucket addressing, which S3-compatible endpoints require. */
  s3ForcePathStyle: boolean;
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
  /** Minimum gap between two alerts to the same pro for the same job, in ms. */
  jobAlertRearmCooldownMs: number;
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

  // An S3-compatible endpoint is an all-or-nothing group: signing a request
  // needs the endpoint, the key id and the secret together, and any partial set
  // would fail at the first upload in a way that is awkward to diagnose there.
  const s3Endpoint = env.S3_ENDPOINT ?? null;
  const s3AccessKeyId = env.S3_ACCESS_KEY_ID ?? null;
  const s3SecretAccessKey = env.S3_SECRET_ACCESS_KEY ?? null;
  const s3Configured = s3Endpoint !== null || s3AccessKeyId !== null || s3SecretAccessKey !== null;
  if (s3Configured) {
    const missing = [
      s3Endpoint === null ? 'S3_ENDPOINT' : null,
      s3AccessKeyId === null ? 'S3_ACCESS_KEY_ID' : null,
      s3SecretAccessKey === null ? 'S3_SECRET_ACCESS_KEY' : null,
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n  - ${missing.join(
          ', ',
        )}: S3-compatible storage needs S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together.`,
      );
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    isProduction: env.NODE_ENV === 'production',
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL ?? null,
    redisUrl: env.REDIS_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET ?? null,
    supabaseJwksUrl: env.SUPABASE_JWKS_URL ?? null,
    s3Region: env.S3_REGION,
    s3BucketSelfies: env.S3_BUCKET_SELFIES,
    s3BucketJobImages: env.S3_BUCKET_JOB_IMAGES,
    s3BucketAvatars: env.S3_BUCKET_AVATARS,
    s3PublicBaseUrlSelfies: env.S3_PUBLIC_BASE_URL_SELFIES ?? null,
    s3PublicBaseUrlJobImages: env.S3_PUBLIC_BASE_URL_JOB_IMAGES ?? null,
    s3PublicBaseUrlAvatars: env.S3_PUBLIC_BASE_URL_AVATARS ?? null,
    s3Endpoint,
    s3Credentials: s3Configured
      ? { accessKeyId: s3AccessKeyId as string, secretAccessKey: s3SecretAccessKey as string }
      : null,
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
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
    jobAlertRearmCooldownMs: env.JOB_ALERT_REARM_COOLDOWN_MS,
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
