import { Redirect } from 'expo-router';
import { isActiveJobStatus, isSettlementPendingStatus } from '@samona/types';
import { useProJobs, useSession } from '@/hooks';
import { hasChosenLanguage } from '@/i18n';

/**
 * Entry route — the single place the post-sign-in decision is made.
 *
 *   new Pro, no language yet  -> language step
 *   not authenticated        -> phone flow
 *   no/incomplete onboarding -> resume at the first unanswered step
 *   unpaid completed job     -> the cash-settlement screen, not home
 *   active job (not terminal)-> the map-first job screen, not home
 *   onboarding complete      -> home
 *
 * `nextStep` is computed by the server from the profile's own data, so the app
 * never has to assemble the decision from several requests, and resuming works
 * the same whether the Pro closed the app one step in or six.
 *
 * A pro mid-job has no use for the availability home screen, so any assigned
 * job that hasn't reached a terminal outcome wins over home and drops straight
 * into the job screen. Money owed comes first: a completed but unpaid job holds
 * the payment screen until the pro confirms the cash is collected — only then
 * is the job truly finished (CLAUDE.md workflow).
 */
export default function Index() {
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep, error } = useSession();
  // Only fetch assigned jobs once the Pro is actually eligible for work; a 401
  // on the welcome screen would be pure waste against the rate limiter.
  const jobsQuery = useProJobs(undefined, {
    enabled: isAuthenticated && isOnboardingComplete && !error,
  });

  // The splash (`SplashGate`) covers this route while it resolves; rendering
  // nothing avoids a second loading treatment flashing under the handoff.
  if (isLoading) {
    return null;
  }

  // A brand-new Pro picks a language before anything else. Only unauthenticated
  // users are gated: an existing Pro who updated the app and never saved a
  // language keeps their current experience and can switch from settings.
  if (!isAuthenticated && !hasChosenLanguage()) {
    return <Redirect href="/choose-language" />;
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

  const jobs = jobsQuery.data ?? [];
  const settlementJob = jobs.find((job) => isSettlementPendingStatus(job.status));
  const activeJob = jobs.find((job) => isActiveJobStatus(job.status));

  if (jobsQuery.isPending) {
    return null;
  }

  if (settlementJob) {
    return <Redirect href={`/job/${settlementJob.id}/pay`} />;
  }

  if (activeJob) {
    return <Redirect href={`/job/${activeJob.id}/active`} />;
  }

  return <Redirect href="/home" />;
}
