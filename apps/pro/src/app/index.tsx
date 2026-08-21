import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';

/**
 * Entry route.
 *
 * Waits for Clerk to restore any persisted session, then sends the user to the
 * right stack. Keeping the decision here means no other screen has to guard
 * for it.
 */
export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA Pro" />
      </Screen>
    );
  }

  return <Redirect href={isSignedIn ? '/home' : '/welcome'} />;
}
