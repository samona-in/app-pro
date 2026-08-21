import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useAuth } from '@/providers';

/**
 * Entry route.
 *
 * Waits for Supabase to restore any persisted session, then sends the user to
 * the right stack. Keeping the decision here means no other screen has to guard
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
