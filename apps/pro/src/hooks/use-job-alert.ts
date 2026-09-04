import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isJobAlertPlaying, startJobAlert, stopJobAlert } from '@/services/job-alert';
import { jobNotificationService } from '@/services/job-notifications';
import {
  useIncomingJobStore,
  type IncomingJobResolution,
} from '@/stores/incoming-job';

/**
 * How long the incoming-job request stays actionable before the countdown ring
 * closes it. The Rapido-style ring owns this timing; it is a client-side
 * decision window only — the server auto-expires unaccepted jobs on its own,
 * longer TTL. When the ring hits zero the alert just closes with no "expired"
 * label.
 */
export const JOB_ALERT_TIMEOUT_MS = 16_000;

/**
 * Bridges incoming-job events (socket + push) to the alarm audio and overlay.
 *
 * The alarm plays continuously while any job is in the queue (active or
 * pending). It stops only when the queue is fully empty or the pro goes
 * offline. The centralized service handles deduplication between socket and
 * push events.
 *
 * Mount once in the signed-in app.
 */
export function useJobAlert() {
  const activeJob = useIncomingJobStore((state) => state.job);
  const resolution = useIncomingJobStore((state) => state.resolution);
  const pendingJobs = useIncomingJobStore((state) => state.pendingJobs);
  const clear = useIncomingJobStore((state) => state.clear);

  // Start/stop the alarm to match the queue's state.
  // Alarm plays while the active job is unresolved OR while there are pending
  // jobs waiting behind it.
  useEffect(() => {
    if ((activeJob && !resolution) || pendingJobs.length > 0) {
      void startJobAlert();
    } else {
      stopJobAlert();
    }
  }, [activeJob, resolution, pendingJobs.length]);

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
