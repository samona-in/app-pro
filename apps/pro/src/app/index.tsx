import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useBootstrapSession } from '@/hooks/use-bootstrap-session';
import { useSession } from '@/hooks';

/**
 * Entry route. Resolves the stored session once, then hands off to the correct
 * stack. Keeping the decision here means no other screen has to guard for it.
 */
export default function Index() {
  useBootstrapSession();
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA Pro" />
      </Screen>
    );
  }

  return <Redirect href={isAuthenticated ? '/home' : '/welcome'} />;
}
