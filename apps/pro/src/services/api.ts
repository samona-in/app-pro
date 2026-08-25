import { createApiClient } from '@samona/api-client';
import { API_PREFIX } from '@samona/config';
import { env } from '@/env';

/**
 * Supplies the current Supabase access token.
 *
 * Supabase exposes the session through its client, but this module is a
 * singleton created at import time, so `AuthProvider` registers the getter once
 * at mount. Until it does, requests go out unauthenticated and the server
 * answers 401 — which is correct, not a failure mode to paper over.
 */
type TokenGetter = () => Promise<string | null>;

let getSessionToken: TokenGetter | null = null;

export function setSessionTokenGetter(getter: TokenGetter | null): void {
  getSessionToken = getter;
}

/**
 * The app's single API client instance.
 *
 * Feature code imports typed service functions built on top of this — it should
 * not construct clients or hardcode URLs (CLAUDE.md "API").
 */
export const api = createApiClient({
  baseUrl: env.apiUrl,
  prefix: API_PREFIX,
  // Production builds must not send bearer tokens over cleartext HTTP.
  requireHttps: !env.isDev,
  defaultHeaders: { 'X-App-Type': 'pro' },
  getAccessToken: async () => {
    if (!getSessionToken) return null;
    try {
      return await getSessionToken();
    } catch {
      // A token refresh can fail while offline; a 401 is the right outcome.
      return null;
    }
  },
  onUnauthenticated: () => {
    // Supabase owns session lifetime and will emit a signed-out event that the
    // router reacts to. Nothing to clear here.
  },
});
