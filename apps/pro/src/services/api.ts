import { createApiClient } from '@samona/api-client';
import { API_PREFIX } from '@samona/config';
import { env } from '@/env';
import { useSessionStore } from '@/stores/session';
import { tokenStorage } from './token-storage';

/**
 * The app's single API client instance.
 *
 * Feature code imports typed service functions built on top of this — it should
 * not construct clients or hardcode URLs (CLAUDE.md "API").
 */
export const api = createApiClient({
  baseUrl: env.apiUrl,
  prefix: API_PREFIX,
  getAccessToken: () => tokenStorage.getAccessToken(),
  onUnauthenticated: async () => {
    // The token is gone or rejected: drop local session state so the router
    // sends the user back to the auth stack.
    await tokenStorage.clear();
    useSessionStore.getState().clearSession();
  },
});
