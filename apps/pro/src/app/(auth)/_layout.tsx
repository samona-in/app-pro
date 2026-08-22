import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useAuth } from '@/providers';
import { color } from '@/theme';

/**
 * Auth stack, with the guard that sends a signed-in user into the app.
 *
 * This is what moves the user on after a successful verification. Navigating
 * imperatively from the verify screen would only cover that one path; a guard
 * here also covers restoring a persisted session and deep links that land on an
 * auth route while already signed in.
 */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  // Wait for the persisted session before deciding, or a returning user sees
  // the welcome screen flash before being redirected away from it.
  if (!isLoaded) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA Pro" />
      </Screen>
    );
  }

  // Route through "/" so the onboarding decision is made in one place rather
  // than duplicated here.
  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
