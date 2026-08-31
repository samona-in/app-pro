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
  JOB_ALERT_MAX_REPEATS: z.coerce.number().int().min(1).max(100).default(20),
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
  /** Expo push service access token; null disables outbound pushes. */
  expoAccessToken: string | null;
  /** Repeating job-alert cadence, in ms. */
  jobAlertRepeatMs: number;
  /** Ceiling on repeats for a single job alert. */
  jobAlertMaxRepeats: number;
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
    expoAccessToken: env.EXPO_ACCESS_TOKEN ?? null,
    jobAlertRepeatMs: env.JOB_ALERT_REPEAT_MS,
    jobAlertMaxRepeats: env.JOB_ALERT_MAX_REPEATS,
  };
}
