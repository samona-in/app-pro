import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { setSessionTokenGetter } from '@/services/api';
import { connectRealtime, disconnectRealtime } from '@/services/realtime';
import { startPushTokenSync } from '@/services/notifications';

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
  const pushSync = useRef<ReturnType<typeof startPushTokenSync> | null>(null);

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

  // Ask for notification permission and register the device's push token while
  // signed in, so chat messages and booking updates reach the customer even
  // with the app locked/backgrounded. Best-effort: denied permission or a
  // failed registration must not block sign-in.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const sync = startPushTokenSync(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id === userId ? data.session.access_token : null;
    });
    pushSync.current = sync;
    return () => {
      sync.stop();
      if (pushSync.current === sync) pushSync.current = null;
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (session?.access_token) pushSync.current?.synchronize();
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
        pushSync.current?.stop();
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
