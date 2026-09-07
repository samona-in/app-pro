import { useEffect, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { LoadingState } from '@/components/feedback';
import { Screen } from '@/components/ui';
import { jobNotificationService } from '@/services/job-notifications';
import { useSession } from '@/hooks';

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
 */
export default function JobAlertRoute() {
  const { id, action } = useLocalSearchParams<{ id?: string; action?: string }>();
  const { isLoading, isAuthenticated } = useSession();
  const jobId = typeof id === 'string' ? id : null;
  const nativeAction = action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : null;
  const [resolved, setResolved] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !jobId || !nativeAction || startedRef.current) return;
    startedRef.current = true;
    // Hold the redirect until the accept/decline has actually landed, so the
    // trip screen never opens before the server knows the job is claimed.
    void jobNotificationService.resolveNativePendingAction(jobId, nativeAction).finally(() => {
      setResolved(true);
    });
  }, [isLoading, isAuthenticated, jobId, nativeAction]);

  if (isLoading) return null;

  // The API call can take a moment — surface a loading screen instead of a
  // blank flash before the redirect.
  if (nativeAction && !resolved) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadingState
          message={nativeAction === 'accept' ? 'Accepting the job…' : 'Sending your response…'}
        />
      </Screen>
    );
  }

  // After a native accept, send the pro straight to the accepted job's map-first
  // trip screen. Everything else drops back into the app normally.
  const target = nativeAction === 'accept' && isAuthenticated ? `/job/${jobId}/active` : '/home';
  return <Redirect href={isAuthenticated ? target : '/welcome'} />;
}
