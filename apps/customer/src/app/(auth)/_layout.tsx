import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useAuth } from '@/providers';
import { color } from '@/theme';

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA" />
      </Screen>
    );
  }

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
