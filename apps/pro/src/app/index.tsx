import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { isActiveJobStatus, isSettlementPendingStatus } from '@samona/types';
import { useProJobs, useSession } from '@/hooks';

/**
 * Entry route — the single place the post-sign-in decision is made.
 *
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
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, isOnboardingComplete, nextStep, error } = useSession();
  // Only fetch assigned jobs once the Pro is actually eligible for work; a 401
  // on the welcome screen would be pure waste against the rate limiter.
  const jobsQuery = useProJobs(undefined, {
    enabled: isAuthenticated && isOnboardingComplete && !error,
  });

  if (isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message={t('boot.starting')} />
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

  const jobs = jobsQuery.data ?? [];
  const settlementJob = jobs.find((job) => isSettlementPendingStatus(job.status));
  const activeJob = jobs.find((job) => isActiveJobStatus(job.status));

  if (jobsQuery.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState message={t('boot.checkingActiveJob')} />
      </Screen>
    );
  }

  if (settlementJob) {
    return <Redirect href={`/job/${settlementJob.id}/pay`} />;
  }

  if (activeJob) {
    return <Redirect href={`/job/${activeJob.id}/active`} />;
  }

  return <Redirect href="/home" />;
}
