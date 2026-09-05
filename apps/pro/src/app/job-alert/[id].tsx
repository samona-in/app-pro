import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { jobNotificationService } from '@/services/job-notifications';
import { useSession } from '@/hooks';

/**
 * Landing screen for a full-screen job alert.
 *
 * The native FCM service posts NEW_JOB pushes with a full-screen intent that
 * opens `samonapro://job-alert/:id` over whatever the pro is doing. This route
 * exists only to hand the job id to the incoming-job service — which fetches
 * the job and enqueues it, raising the accept/reject overlay from the tabs
 * layout — and then drop straight back into the app. Rendering anything here
 * would cover the overlay it is meant to surface.
 *
 * The alert is only raised once the session has been restored: at a true cold
 * start the push arrives before Supabase has hydrated the token, so the fetch
 * the alert depends on would go out unauthenticated and the alert would be
 * silently lost. Waiting on the same session gate the tabs layout uses keeps
 * this path correct for a killed-app launch.
 */
export default function JobAlertRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isLoading, isAuthenticated } = useSession();
  const jobId = typeof id === 'string' ? id : null;

  useEffect(() => {
    if (isLoading || !isAuthenticated || !jobId) return;
    // Best-effort: if the job is unavailable or the pro is offline this is a
    // no-op and the redirect below just opens the app normally.
    void jobNotificationService.handleJobNotification(jobId);
  }, [isLoading, isAuthenticated, jobId]);

  if (isLoading) return null;

  // The tabs layout routes onboarding and the rest; send the pro there.
  return <Redirect href={isAuthenticated ? '/home' : '/welcome'} />;
}
