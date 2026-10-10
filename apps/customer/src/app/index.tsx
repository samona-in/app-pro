import { Redirect } from 'expo-router';
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

  // The splash (`SplashGate`) covers this route while it resolves; rendering
  // nothing avoids a second loading treatment flashing under the handoff.
  if (isLoading) {
    return null;
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
