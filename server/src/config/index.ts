import path from 'node:path';
import { z } from 'zod';

/**
 * Environment schema.
 *
 * The process fails fast at boot if anything is missing or malformed — a
 * misconfigured server should never start and serve broken requests.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /**
   * Supabase connection string. Use the *pooled* (Supavisor, port 6543) URL at
   * runtime — a serverless-style pool exhausts direct Postgres connections fast.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  /**
   * Direct (port 5432) connection, used only by `prisma migrate`. Migrations
   * need a real session; they cannot run through a transaction pooler.
   */
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for migrations.'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required.'),

  /** Clerk server key. Never shipped to a client. */
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required.'),
  /**
   * Clerk publishable key. Required on the server too: the backend derives the
   * instance's Frontend API from it in order to verify session tokens. Public
   * by design — it is the same value the app ships.
   */
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required.'),
  /** Signing secret for Clerk webhooks; without it, anyone can post events. */
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),

  /**
   * Role assigned to a user provisioned on first sign-in.
   *
   * This API currently serves the Pro app only. When the customer app lands,
   * role assignment must come from a separate Clerk instance or an explicit
   * verified signup step — not from a single global default.
   */
  SIGNUP_DEFAULT_ROLE: z.enum(['CUSTOMER', 'PRO', 'ADMIN']).default('PRO'),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default(''),

  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  isProduction: boolean;
  databaseUrl: string;
  directUrl: string;
  redisUrl: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
  clerkWebhookSigningSecret: string | null;
  signupDefaultRole: 'CUSTOMER' | 'PRO' | 'ADMIN';
  corsOrigins: string[];
  googleMapsApiKey: string | null;
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
    clerkSecretKey: env.CLERK_SECRET_KEY,
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
    clerkWebhookSigningSecret: env.CLERK_WEBHOOK_SIGNING_SECRET ?? null,
    signupDefaultRole: env.SIGNUP_DEFAULT_ROLE,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY ?? null,
  };
}
