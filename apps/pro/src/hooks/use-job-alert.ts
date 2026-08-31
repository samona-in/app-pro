import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { JobStatus, type AvailableJob, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { isJobAlertPlaying, startJobAlert, stopJobAlert } from '@/services/job-alert';
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

/** Statuses that mean the alerted job can no longer be taken. */
const UNAVAILABLE_STATUSES: ReadonlySet<JobDetail['status']> = new Set<JobDetail['status']>([
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
  JobStatus.PAID,
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
]);

/**
 * Bridges incoming-job realtime events to the alarm audio and overlay.
 *
 * A single authoritative flow (CLAUDE.md "Realtime"): a `job:new` shows the
 * overlay and starts the looping beep; the beep stops the moment the job is
 * accepted, rejected, expired, cancelled, or reported unavailable, and never
 * while more than one offer is pending. Mount once in the signed-in app.
 *
 * The audio service keeps one player, so duplicate events and re-renders cannot
 * stack alarm instances (requirements 5 & 6).
 */
export function useJobAlert() {
  const show = useIncomingJobStore((state) => state.show);
  const resolve = useIncomingJobStore((state) => state.resolve);
  const clear = useIncomingJobStore((state) => state.clear);
  const activeJob = useIncomingJobStore((state) => state.job);
  const resolution = useIncomingJobStore((state) => state.resolution);

  // Ref mirrors make the realtime handlers read the freshest store value without
  // re-subscribing on every change. Kept in an effect per the refs lint rule.
  const activeJobRef = useRef(activeJob);
  const resolveRef = useRef(resolve);
  useEffect(() => {
    activeJobRef.current = activeJob;
    resolveRef.current = resolve;
  }, [activeJob, resolve]);

  // Start/stop the alarm to match the overlay's presence and resolution.
  useEffect(() => {
    if (activeJob && !resolution) {
      void startJobAlert();
    } else {
      stopJobAlert();
    }
  }, [activeJob, resolution]);

  // Auto-expire a request the pro never acted on.
  useEffect(() => {
    if (!activeJob || resolution) return;
    const timer = setTimeout(() => {
      if (activeJobRef.current && !useIncomingJobStore.getState().resolution) {
        resolveRef.current('expired');
      }
    }, JOB_ALERT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeJob, resolution]);

  // The alarm is loud by design: if anything pushes the app to background
  // without a resolution, silence it rather than letting it ring over the lock
  // screen (push notifications are the background alert instead).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && isJobAlertPlaying() && !useIncomingJobStore.getState().resolution) {
        stopJobAlert();
      }
    });
    return () => sub.remove();
  }, []);

  // Realtime wiring + unmount cleanup.
  useEffect(() => {
    const onNew = (newJob: AvailableJob) => {
      // A second request while the first is pending: show the newest and keep a
      // single alarm. The store/audio are guarded against stacking.
      show(newJob);
      void startJobAlert();
    };
    const onStatus = (detail: JobDetail) => {
      const current = activeJobRef.current;
      if (!current) return;
      // A job:status for a job we are alerting that is no longer open means it
      // was taken, cancelled, or expired elsewhere — stop ringing.
      if (detail.id === current.id && UNAVAILABLE_STATUSES.has(detail.status)) {
        resolveRef.current(detail.status === JobStatus.CANCELLED ? 'cancelled' : 'unavailable');
      }
    };

    const unsubscribes = [subscribe('job:new', onNew), subscribe('job:status', onStatus)];
    return () => {
      unsubscribes.forEach((off) => off());
      clear();
      stopJobAlert();
    };
  }, [show, clear]);

  return {
    activeJob,
    resolution,
    resolve: (r: IncomingJobResolution) => resolve(r),
    dismiss: clear,
  };
}
