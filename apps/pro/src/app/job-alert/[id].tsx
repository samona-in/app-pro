import { useEffect, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { jobNotificationService } from '@/services/job-notifications';
import { useProJobs, useSession } from '@/hooks';
import { queryKeys } from '@/constants';
import { occupiedJobRoute } from '@/utils/job-routes';

/**
 * Landing screen for a full-screen job alert / tray action.
 *
 * The native Android alert pipeline brings the app to `samonapro://job-alert/:id`
 * in two cases:
 *
 * 1. The pro tapped Accept or Decline on the native overlay banner WITHOUT a
 *    signed offer token (legacy / non-FCM push). The native side only recorded
 *    the choice and stopped the alarm; this route — running with the secured
 *    token — performs the actual API call and then lands the pro on the
 *    accepted job (or drops a decline harmlessly).
 *
 * 2. A full-screen intent / a plain tray tap opens a NEW_JOB with no action.
 *    Presentation is native everywhere now (no in-app ring), so there is
 *    nothing to render here — the route just drops back into the app. The job
 *    stays open server-side; the pro accepts/declines from the native alert.
 *
 * The action is only executed once the session has been restored: at a true
 * cold start the push arrives before Supabase has hydrated the token, so the
 * API call would go out unauthenticated and fail.
 *
 * Money owed wins: the accept must never pull the pro off the cash-settlement
 * screen of a completed-but-unpaid job. The native accept redeems the job over
 * the API directly — outside the query cache — so the decision below re-reads
 * the assigned jobs before routing; when a job is still awaiting the pro's
 * "Collect cash" swipe, this route hands them back to that payment screen, and
 * only a settlement-free pro is handed to the accepted job's trip screen.
 */
export default function JobAlertRoute() {
  const { t } = useTranslation();
  const { id, action } = useLocalSearchParams<{ id?: string; action?: string }>();
  const { isLoading, isAuthenticated } = useSession();
  const jobsQuery = useProJobs();
  const queryClient = useQueryClient();
  const jobId = typeof id === 'string' ? id : null;
  const nativeAction = action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : null;
  const [resolved, setResolved] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !jobId || !nativeAction || startedRef.current) return;
    startedRef.current = true;
    console.log('[JobAlertRoute] Processing native action', { jobId, nativeAction });
    void (async () => {
      try {
        await jobNotificationService.resolveNativePendingAction(jobId, nativeAction);
        if (nativeAction === 'accept') {
          // The native accept is executed here (and only here) for the
          // un-tokenized path, so the assigned list must be refreshed before we
          // route — otherwise a completed-but-unpaid job may not show yet and
          // the pro gets bounced to the just-accepted job instead of payment.
          await queryClient.refetchQueries({ queryKey: queryKeys.jobs.all });
        }
      } catch (e) {
        console.warn('[JobAlertRoute] Failed to resolve native pending action', e);
        // The accept/decline is best-effort; the redirect below still routes
        // from whatever jobs are known.
      } finally {
        setResolved(true);
      }
    })();
  }, [isLoading, isAuthenticated, jobId, nativeAction, queryClient]);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  // Hold the redirect (a cold start has nothing in the cache yet) so we never
  // flash the wrong target before the assigned-jobs decision can be made.
  if ((nativeAction && !resolved) || jobsQuery.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState
          message={
            nativeAction === 'accept' && !resolved
              ? t('jobAlert.accepting')
              : nativeAction === 'decline' && !resolved
                ? t('jobAlert.sendingResponse')
                : t('jobAlert.checkingJobs')
          }
        />
      </Screen>
    );
  }

  // After a native accept, send the pro to the accepted job's map-first trip
  // screen — unless a completed job is still awaiting cash collection, in which
  // case money owed wins and payment keeps the pro. Everything else drops back
  // into the app via the same rule (an unpaid settlement → its pay screen).
  const occupied = occupiedJobRoute(jobsQuery.data ?? []);
  const target =
    nativeAction === 'accept' ? (occupied ?? `/job/${jobId}/active`) : (occupied ?? '/home');
  return <Redirect href={target} />;
}
