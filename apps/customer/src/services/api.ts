import { createApiClient } from '@samona/api-client';
import { API_PREFIX } from '@samona/config';
import { env } from '@/env';

type TokenGetter = () => Promise<string | null>;

let getSessionToken: TokenGetter | null = null;

export function setSessionTokenGetter(getter: TokenGetter | null): void {
  getSessionToken = getter;
}

export const api = createApiClient({
  baseUrl: env.apiUrl,
  prefix: API_PREFIX,
  requireHttps: !env.isDev,
  defaultHeaders: { 'X-App-Type': 'customer' },
  getAccessToken: async () => {
    if (!getSessionToken) return null;
    try {
      return await getSessionToken();
    } catch {
      return null;
    }
  },
  onUnauthenticated: () => {},
});
