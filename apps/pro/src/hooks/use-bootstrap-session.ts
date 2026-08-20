import { useEffect } from 'react';
import { tokenStorage } from '@/services/token-storage';
import { useSessionStore } from '@/stores/session';

/**
 * Resolves the session once at startup.
 *
 * Today this only checks whether a token is stored. Once `GET /auth/me` exists,
 * a stored token should be exchanged for the current user here and the result
 * passed to `setSession` — until then a stored token cannot be verified, so the
 * app treats the session as unauthenticated rather than trusting it.
 */
export function useBootstrapSession(): void {
  const setStatus = useSessionStore((state) => state.setStatus);

  useEffect(() => {
    let cancelled = false;

    async function resolveSession() {
      try {
        await tokenStorage.getAccessToken();
      } catch (error) {
        // Secure Store can fail on a locked device; log rather than swallow.
        console.warn('Could not read the stored session token.', error);
      } finally {
        if (!cancelled) setStatus('unauthenticated');
      }
    }

    void resolveSession();
    return () => {
      cancelled = true;
    };
  }, [setStatus]);
}
