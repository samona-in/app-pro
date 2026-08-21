/**
 * Canonical environment-variable names.
 *
 * Code reads variables through these constants so a rename is a single edit and
 * `.env.example` stays verifiable. No values live here — never hardcode URLs or
 * secrets (CLAUDE.md "API", "Security").
 */
export const SERVER_ENV_KEYS = {
  databaseUrl: 'DATABASE_URL',
  redisUrl: 'REDIS_URL',
  jwtSecret: 'JWT_SECRET',
  port: 'PORT',
  corsOrigins: 'CORS_ORIGINS',
  nodeEnv: 'NODE_ENV',
  googleMapsApiKey: 'GOOGLE_MAPS_API_KEY',
} as const;

/**
 * Client-side keys. Expo inlines every `EXPO_PUBLIC_*` variable into the app
 * bundle, so these values are public by definition — never put a secret here.
 */
export const CLIENT_ENV_KEYS = {
  apiUrl: 'EXPO_PUBLIC_API_URL',
  googleMapsApiKey: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
} as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[keyof typeof SERVER_ENV_KEYS];
export type ClientEnvKey = (typeof CLIENT_ENV_KEYS)[keyof typeof CLIENT_ENV_KEYS];
