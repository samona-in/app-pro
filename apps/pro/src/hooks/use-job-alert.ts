import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isJobAlertPlaying, startJobAlert, stopJobAlert } from '@/services/job-alert';
import { jobNotificationService } from '@/services/job-notifications';
import {
  useIncomingJobStore,
  type IncomingJobResolution,
} from '@/stores/incoming-job';

/**
 * How long the incoming-job alarm keeps ringing for a request before it is
 * treated as expired. The server does not stream a per-pro expiry, so the client
 * owns the "you missed it" timer as a safety net; accepting or a `job:status`
 * event resolves earlier when the server reports it.
 */
export const JOB_ALERT_TIMEOUT_MS = 45_000;

/**
 * Bridges incoming-job events (socket + push) to the alarm audio and overlay.
 *
 * A single authoritative flow: a job event shows the overlay and starts the
 * looping beep; the beep stops the moment the job is accepted, rejected,
 * expired, cancelled, or reported unavailable. The centralized service handles
 * deduplication between socket and push events.
 *
 * Mount once in the signed-in app.
 */
export function useJobAlert() {
  const activeJob = useIncomingJobStore((state) => state.job);
  const resolution = useIncomingJobStore((state) => state.resolution);
  const clear = useIncomingJobStore((state) => state.clear);

  // Start/stop the alarm to match the overlay's presence and resolution.
  useEffect(() => {
    if (activeJob && !resolution) {
      void startJobAlert();
    } else {
      stopJobAlert();
    }
  }, [activeJob, resolution]);

  // The alarm is loud by design: if anything pushes the app to background
  // without a resolution, silence it rather than letting it ring over the lock
  // screen (push notifications are the background alert instead).
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' && isJobAlertPlaying() && !useIncomingJobStore.getState().resolution) {
        stopJobAlert();
      }
      await jobNotificationService.onAppStateChange(state);
    });
    return () => sub.remove();
  }, []);

  // Initialize the centralized job notification service.
  useEffect(() => {
    jobNotificationService.initialize();

    return () => {
      jobNotificationService.cleanup();
      clear();
      stopJobAlert();
    };
  }, [clear]);

  const handleResolve = (r: IncomingJobResolution) => {
    if (activeJob?.id) {
      jobNotificationService.resolveJob(activeJob.id, r);
    }
  };

  return {
    activeJob,
    resolution,
    resolve: handleResolve,
    dismiss: () => jobNotificationService.dismissJob(),
  };
}