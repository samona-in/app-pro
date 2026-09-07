import { CLIENT_ENV_KEYS } from '@samona/config';

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
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  /**
   * The EAS project id, used to mint Expo push tokens. Baked in explicitly so
   * locally-built APKs can register push tokens too.
   */
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null,
  /**
   * Test-only phone sign-in bypass. When set, the verify screen offers to fill
   * this fixed code and the phone screen offers this number, matching a Supabase
   * "Test phone number" so no SMS is sent. Leave unset in production.
   */
  authTestPhone: process.env.EXPO_PUBLIC_AUTH_TEST_PHONE ?? null,
  authTestOtp: process.env.EXPO_PUBLIC_AUTH_TEST_OTP ?? null,
  isDev: __DEV__,
} as const;
