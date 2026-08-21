import { useEffect, type ReactNode } from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { env } from '@/env';
import { setSessionTokenGetter } from '@/services/api';

/**
 * Hands Clerk's `getToken` to the API client singleton.
 *
 * Rendered inside `ClerkProvider` so the hook is available, and it renders
 * nothing itself — this is wiring, not UI.
 */
function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setSessionTokenGetter(() => getToken());
    return () => setSessionTokenGetter(null);
  }, [getToken]);

  return <>{children}</>;
}

/**
 * Clerk session provider.
 *
 * `tokenCache` persists the session to the device keychain via Secure Store, so
 * a returning user is not asked to verify their phone again on every launch.
 * The publishable key is public by design; the secret key never leaves the
 * server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkTokenBridge>{children}</ClerkTokenBridge>
    </ClerkProvider>
  );
}
