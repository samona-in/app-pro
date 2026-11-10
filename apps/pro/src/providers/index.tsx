import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppUpdateGate } from '@samona/app-updates';
import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';
import { color } from '@/theme';
// Avoid hooks barrel imports that can create cycles; import directly.
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
  const { t } = useTranslation();

  const updateStrings = useMemo(
    () => ({
      optionalTitle: t('appUpdate.optionalTitle'),
      optionalDescription: t('appUpdate.optionalDescription'),
      mandatoryTitle: t('appUpdate.mandatoryTitle'),
      mandatoryDescription: t('appUpdate.mandatoryDescription'),
      updateNow: t('appUpdate.updateNow'),
      maybeLater: t('appUpdate.maybeLater'),
      readyTitle: t('appUpdate.readyTitle'),
      readyDescription: t('appUpdate.readyDescription'),
      restartNow: t('appUpdate.restartNow'),
      errorTitle: t('appUpdate.errorTitle'),
      errorDescription: t('appUpdate.errorDescription'),
      tryAgain: t('appUpdate.tryAgain'),
      notNow: t('appUpdate.notNow'),
      closeA11y: t('appUpdate.closeA11y'),
    }),
    [t],
  );

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
            {/* Google Play in-app updates: optional/flexible and mandatory/immediate. */}
            <AppUpdateGate
              strings={updateStrings}
              theme={{
                brand: color.brand,
                brandContrast: color['brand-contrast'],
                surface: color.surface,
                textPrimary: color['text-primary'],
                textSecondary: color['text-secondary'],
                border: color.border,
                danger: color.danger,
              }}
            />
          </QueryProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export { AuthProvider, useAuth } from './auth-provider';
export { QueryProvider } from './query-provider';
