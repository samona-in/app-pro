import { Redirect } from 'expo-router';
import { isApiError } from '@samona/api-client';
import { ApiErrorCode } from '@samona/types';
import { useSession } from '@/hooks';

/**
 * Entry route — the single place the post-sign-in decision is made.
 *
 *   not authenticated           -> phone flow
 *   deletion still in progress  -> the terminal "deletion in progress" screen
 *   stale/invalid session       -> clean sign-in
 *   no/incomplete onboarding    -> resume at the first unanswered step
 *   onboarding complete         -> home
 */
export default function Index() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep, error, signOut } =
    useSession();

  // The splash (`SplashGate`) covers this route while it resolves; rendering
  // nothing avoids a second loading treatment flashing under the handoff.
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (error) {
    const code = isApiError(error) ? error.code : null;
    // A deletion was accepted but the account still has active bookings; the
    // identity must not mint a new surface until it finalizes.
    if (code === ApiErrorCode.CONFLICT) {
      return <Redirect href="/deletion-in-progress" />;
    }
    // A token the server no longer accepts must fall back to a clean sign-in
    // rather than pretending the account is brand-new.
    if (code === ApiErrorCode.UNAUTHENTICATED) {
      void signOut();
      return <Redirect href="/welcome" />;
    }
    // Anything else (network, server) — onboarding is safe to re-enter and
    // resumes correctly once the API recovers.
    return <Redirect href="/onboarding/intro" />;
  }

  if (!isOnboardingComplete) {
    return <Redirect href={`/onboarding/${nextStep ?? 'intro'}`} />;
  }

  return <Redirect href="/home" />;
}
