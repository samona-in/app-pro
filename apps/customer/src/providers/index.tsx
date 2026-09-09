import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';
// Imported from its module, not the `@/hooks` barrel: that barrel re-exports
// `use-session.ts`, which imports `./auth-provider`, and re-entry through the
// barrel would form an import cycle with this file.
import { usePushNavigation } from '@/hooks/use-push-navigation';

export function AppProviders({ children }: { children: ReactNode }) {
  // Tap a chat notification → open that booking's thread. Tap a job push
  // (e.g. the start-work OTP) → open the booking detail to read the code out.
  usePushNavigation(
    (jobId) => `/booking/${jobId}/chat`,
    (jobId) => `/booking/${jobId}`,
  );

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

export { AuthProvider, useAuth } from './auth-provider';
export { QueryProvider } from './query-provider';
