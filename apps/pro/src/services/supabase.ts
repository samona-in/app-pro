import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { secureStorage } from './secure-storage';

/**
 * The app's Supabase client.
 *
 * Used for authentication only. Domain data goes through the SAMONA API, which
 * is the single place authorisation is enforced — querying tables directly from
 * the client would put that decision in two places.
 */
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse in a native app; this is a browser-only concern.
    detectSessionInUrl: false,
  },
});

/**
 * Refresh the session only while the app is in the foreground.
 *
 * Without this the refresh timer keeps firing in the background, burning
 * battery and racing the OS suspending the process mid-request.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
