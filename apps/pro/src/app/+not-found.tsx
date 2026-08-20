import { Stack, router } from 'expo-router';
import { ErrorState } from '@/components/feedback';
import { Screen } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <Screen edges={[]}>
        <ErrorState
          title="Page not found"
          message="That screen does not exist in SAMONA Pro."
          retryLabel="Go home"
          onRetry={() => router.replace('/')}
        />
      </Screen>
    </>
  );
}
