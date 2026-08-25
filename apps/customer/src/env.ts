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
  isDev: __DEV__,
} as const;
