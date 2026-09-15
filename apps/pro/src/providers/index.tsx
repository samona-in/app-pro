import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';
// Imported from its module, not the `@/hooks` barrel: that barrel re-exports
// `use-session.ts`, which imports `./auth-provider`, and re-entry through the
// barrel would form an import cycle with this file.
import { usePushNavigation } from '@/hooks/use-push-navigation';
import { IncomingOffersSync } from '@/hooks/use-incoming-offers';
import { JobCancellationSync } from '@/hooks/use-job-cancellation';

/**
 * Every app-wide provider, composed once and mounted by the root layout.
 *
 * Order matters: `AuthProvider` wraps `QueryProvider` so a query firing on
 * mount can already resolve a session token.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Tap a chat notification → open that job's thread.
  usePushNavigation((jobId) => `/job/${jobId}/chat`);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryProvider>
            {/* Feeds and prunes the live pending-offers collection for the whole app. */}
            <IncomingOffersSync />
            {/* Feeds the unacknowledged customer-cancellation collection for the whole app. */}
            <JobCancellationSync />
            {children}
          </QueryProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export { AuthProvider, useAuth } from './auth-provider';
export { QueryProvider } from './query-provider';
