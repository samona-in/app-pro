import type { Env } from './env.validation';

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  isProduction: boolean;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  googleMapsApiKey: string | null;
}

/**
 * Shapes validated env vars into the typed config the app consumes.
 *
 * Application code injects `ConfigService<AppConfig, true>` and never reads
 * `process.env` directly.
 */
export function configuration(): AppConfig {
  const env = process.env as unknown as Env;

  return {
    nodeEnv: env.NODE_ENV,
    port: Number(env.PORT),
    isProduction: env.NODE_ENV === 'production',
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    jwtSecret: env.JWT_SECRET,
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [],
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY ?? null,
  };
}
