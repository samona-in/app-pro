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
   * Supabase publishable key (`sb_publishable_...`). Public by design — it
   * identifies the project and grants only what row-level security allows.
   * The secret key never ships in a bundle.
   */
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  /**
   * The EAS project id, used to mint Expo push tokens. Baked in explicitly
   * (rather than relying on `Constants.easConfig`, which is only populated by
   * EAS cloud builds) so locally-built APKs can register push tokens too.
   */
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null,
  /** Optional until maps are wired up; features must handle its absence. */
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  /**
   * Test-only phone sign-in bypass. When set, the verify screen offers to fill
   * this fixed code and the phone screen offers this number, matching a Supabase
   * "Test phone number" so no SMS is sent. Leave unset in production.
   */
  authTestPhone: process.env.EXPO_PUBLIC_AUTH_TEST_PHONE ?? null,
  authTestOtp: process.env.EXPO_PUBLIC_AUTH_TEST_OTP ?? null,
  isDev: __DEV__,
} as const;
