import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { setSessionTokenGetter } from '@/services/api';
import { connectRealtime, disconnectRealtime } from '@/services/realtime';
import { registerPushToken } from '@/services/notifications';

interface AuthState {
  /** False until the persisted session has been restored from Secure Store. */
  isLoaded: boolean;
  isSignedIn: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Supabase session state.
 *
 * Holds only what the router needs to choose a stack. The SAMONA user record —
 * including `role` — is server state and is fetched through TanStack Query, not
 * mirrored here (CLAUDE.md "React Native Architecture").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    // Restore any persisted session first, so the app does not flash the
    // welcome screen at a user who is already signed in.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setIsLoaded(true);
      })
      .catch((e) => {
        console.warn('[AuthProvider] Failed to restore session', e);
        if (!active) return;
        setIsLoaded(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setIsLoaded(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // The API client is a module singleton, so it reads its bearer token through
  // this getter rather than holding a session itself. Always ask Supabase for
  // the current session so a refreshed token is picked up automatically.
  useEffect(() => {
    setSessionTokenGetter(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });
    return () => setSessionTokenGetter(null);
  }, []);

  // Keep the realtime socket in lockstep with the session. The socket
  // authenticates with the same access token and surface as REST; the gateway
  // rejects a handshake with no valid token, so nothing here is a control.
  useEffect(() => {
    const token = session?.access_token ?? null;
    if (token) connectRealtime(token);
    else disconnectRealtime();
  }, [session]);

  // Ask for notification permission and register the device's push token while
  // signed in, so job alerts reach the pro even with the app locked/backgrounded.
  // Best-effort: denied permission or a failed registration must not block sign-in.
  useEffect(() => {
    if (!session?.access_token) return;
    void registerPushToken();
  }, [session?.access_token]);

  // The socket outlives a render but not the app; drop it on provider unmount.
  useEffect(() => {
    return () => disconnectRealtime();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isLoaded,
      isSignedIn: session !== null,
      session,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [isLoaded, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
