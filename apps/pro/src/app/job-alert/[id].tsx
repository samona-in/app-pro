import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { jobNotificationService } from '@/services/job-notifications';

/**
 * Landing screen for a full-screen job alert.
 *
 * The native FCM service posts NEW_JOB pushes with a full-screen intent that
 * opens `samonapro://job-alert/:id` over whatever the pro is doing. This route
 * exists only to hand the job id to the incoming-job service — which fetches
 * the job and enqueues it, raising the accept/reject overlay from the tabs
 * layout — and then drop straight back into the app. Rendering anything here
 * would cover the overlay it is meant to surface.
 */
export default function JobAlertRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    const jobId = typeof id === 'string' ? id : null;
    if (jobId) {
      // Best-effort: if the job is unavailable or the pro is offline this is a
      // no-op and the redirect below just opens the app normally.
      void jobNotificationService.handleJobNotification(jobId);
    }
  }, [id]);

  return <Redirect href="/home" />;
}