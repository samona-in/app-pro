import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * Aadhaar capture stack.
 *
 * Authenticated Pros only: there is no Aadhaar flow for an anonymous caller,
 * and the upload handshake requires a profile. The stack itself is headerless
 * because each screen draws its own title and back affordance — the camera
 * needs the full frame.
 */
export default function AadhaarLayout() {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message={t('onboarding.loadingProfile')} />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.surface },
        // The capture screen owns an in-flow back stack; a swipe-to-dismiss
        // would bypass it and could drop a captured photo. The intro keeps the
        // swipe so it can be dismissed without a close button.
        gestureEnabled: false,
      }}
    >
      {/* The intro has no close affordance, so the platform back gesture is
          the way out before capture starts. */}
      <Stack.Screen name="index" options={{ gestureEnabled: true }} />
      <Stack.Screen name="capture" />
      <Stack.Screen name="pending" />
    </Stack>
  );
}
