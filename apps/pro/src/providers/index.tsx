import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './clerk-provider';
import { QueryProvider } from './query-provider';

/**
 * Every app-wide provider, composed once and mounted by the root layout.
 *
 * Order matters: `AuthProvider` wraps `QueryProvider` so that any query firing
 * on mount can already resolve a session token.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export { AuthProvider } from './clerk-provider';
export { QueryProvider } from './query-provider';
