import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth client for the admin dashboard.
 *
 * Authentication uses the same phone-OTP flow as the customer and pro apps:
 * Supabase sends and verifies the code. The resulting access token is sent to
 * the API, which checks the database for an active admin record before minting
 * an HttpOnly session cookie.
 *
 * Sessions are deliberately not persisted in browser storage. The admin
 * session lives only in the HttpOnly cookie, so an XSS bug cannot read a token
 * out of `localStorage`. `verifyOtp` returns the session in memory long enough
 * to exchange it, then it is discarded.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/admin/.env.local.',
    );
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
