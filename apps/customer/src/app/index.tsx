import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { useSession } from '@/hooks';

/**
 * Entry route — the single place the post-sign-in decision is made.
 *
 *   not authenticated        -> phone flow
 *   no/incomplete onboarding -> resume at the first unanswered step
 *   onboarding complete      -> home
 */
export default function Index() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep, error } = useSession();

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA" />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (error) {
    return <Redirect href="/onboarding/intro" />;
  }

  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return <Redirect href="/home" />;
}
