import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { setSessionTokenGetter } from '@/services/api';
import { connectRealtime, disconnectRealtime } from '@/services/realtime';

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoaded(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoaded(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

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
