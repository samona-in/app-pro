import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { jobNotificationService } from '@/services/job-notifications';
import { useSession } from '@/hooks';

/**
 * Landing screen for a full-screen job alert.
 *
 * The native overlay / FCM service opens `samonapro://job-alert/:id` over
 * whatever the pro is doing. Two intents land here:
 *
 * 1. Plain NEW_JOB — the route simply hands the job id to the incoming-job
 *    service, which fetches and enqueues it, raising the accept/reject ring
 *    from the tabs layout. Rendering anything here would cover the ring it is
 *    meant to surface.
 *
 * 2. The pro tapped Accept or Decline on the NATIVE overlay banner (the app
 *    was backgrounded/killed). The native side only recorded the choice and
 *    stopped the alarm; the deep link carries it as `?action=` so THIS route —
 *    running with the secured token — performs the actual API call and then
 *    lands the pro on the accepted job (or drops a decline harmlessly).
 *
 * The alert is only raised once the session has been restored: at a true cold
 * start the push arrives before Supabase has hydrated the token, so the fetch
 * the alert depends on would go out unauthenticated and the alert would be
 * silently lost. Waiting on the same session gate the tabs layout uses keeps
 * this path correct for a killed-app launch.
 */
export default function JobAlertRoute() {
  const { id, action } = useLocalSearchParams<{ id?: string; action?: string }>();
  const { isLoading, isAuthenticated } = useSession();
  const jobId = typeof id === 'string' ? id : null;
  const nativeAction = action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : null;

  useEffect(() => {
    if (isLoading || !isAuthenticated || !jobId) return;
    if (nativeAction) {
      // The pro already decided on the native overlay; execute the recorded
      // choice with the secured token. Accept lands them on the accepted job
      // (the redirect below), decline just drops the request.
      void jobNotificationService.resolveNativePendingAction(jobId, nativeAction);
      return;
    }
    // Best-effort: if the job is unavailable or the pro is offline this is a
    // no-op and the redirect below just opens the app normally.
    void jobNotificationService.handleJobNotification(jobId);
  }, [isLoading, isAuthenticated, jobId, nativeAction]);

  if (isLoading) return null;

  // After a native accept, send the pro straight to the accepted job's journey
  // (TRAVELLING CTA). Everything else drops back into the app normally.
  const target = nativeAction === 'accept' && isAuthenticated ? `/job/${jobId}` : '/home';
  return <Redirect href={isAuthenticated ? target : '/welcome'} />;
}
