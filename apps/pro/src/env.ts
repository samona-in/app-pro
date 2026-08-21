import { CLIENT_ENV_KEYS } from '@samona/config';

/**
 * Typed access to the app's environment.
 *
 * Expo statically replaces `process.env.EXPO_PUBLIC_*` at build time, so each
 * variable must be referenced by its full literal name — destructuring or
 * dynamic lookup breaks the substitution.
 *
 * Everything here ships inside the bundle and is therefore public. Secrets stay
 * on the server (CLAUDE.md "Security").
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and set it, ` +
        'then restart the Expo dev server.',
    );
  }
  return value;
}

export const env = {
  apiUrl: required(CLIENT_ENV_KEYS.apiUrl, process.env.EXPO_PUBLIC_API_URL),
  /** Supabase project URL. */
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  /**
   * Supabase anon key. Public by design — it identifies the project and grants
   * only what row-level security allows. The service-role key never ships.
   */
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Optional until maps are wired up; features must handle its absence. */
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  isDev: __DEV__,
} as const;
