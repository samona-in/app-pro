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
 *
 * `nextStep` is computed by the server from the profile's own data, so the app
 * never has to assemble the decision from several requests, and resuming works
 * the same whether the Pro closed the app one step in or six.
 */
export default function Index() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep, error } = useSession();

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message="Starting SAMONA Pro" />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  // The session loaded but the profile call failed. Sending the Pro into the
  // app on unknown state would show a broken home screen, so start onboarding,
  // which is safe to re-enter and will resume correctly once the API recovers.
  if (error) {
    return <Redirect href="/onboarding/intro" />;
  }

  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return <Redirect href="/home" />;
}
