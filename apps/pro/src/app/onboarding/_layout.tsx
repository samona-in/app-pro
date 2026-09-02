import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * Onboarding stack.
 *
 * Guards the same way the other stacks do: an unauthenticated user has no
 * profile to build, so they go back to the phone flow.
 *
 * A Pro who has already finished is deliberately *not* redirected away — they
 * may return here to edit. Routing a finished Pro into onboarding only happens
 * from the entry route, which sends them home instead.
 */
export default function OnboardingLayout() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Loading your profile" />
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
      }}
    />
  );
}
