import { JobStatus, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { jobsApi } from './jobs';
import { clearNativeJobAlert, consumeNativePendingAction } from './overlay-alert';

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
 * Coordinates the native Android job-alert layer with the app.
 *
 * Job-request *presentation* is fully native now: the Android overlay/full-
 * screen/tray raises every NEW_JOB push in every app state, so no JS ring
 * exists anymore. What JS still owns is the two seams only the app can touch:
 *
 *  - Executing an Accept/Decline a pro tapped on the native overlay when the
 *    push carried no signed offer token (with a token the overlay redeems the
 *    job over the API by itself and never launches the app). The deep link
 *    `job-alert/[id]?action=` carries the recorded choice here with the token
 *    the app alone holds.
 *  - Clearing the native overlay/tray/ring when realtime says a queued job was
 *    claimed, cancelled or expired, so a pro is never left ringing a dead
 *    request. REST stays the source of truth; this is a cleanup, not a decision.
 */
function createJobNotificationService() {
  const socketUnsubscribes: (() => void)[] = [];
  let isInitialized = false;

  async function initialize(): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;
    setupSocketListeners();
  }

  function setupSocketListeners(): void {
    // Terminating job:status events drop the matching native alert. (Only
    // terminal pushes reach the dead process; this covers the live path.)
    const onStatus = (detail: JobDetail) => {
      if (UNAVAILABLE_STATUSES.has(detail.status)) {
        void clearNativeJobAlert(detail.id);
      }
    };

    socketUnsubscribes.push(subscribe('job:status', onStatus));
  }

  /**
   * Executes the accept/decline a pro tapped on the native overlay banner.
   *
   * The native button only records the choice, stops the alarm and opens the
   * app; this is where the authorized API call actually runs — single-tap UX
   * with the token held only by the app. Called from the `job-alert/:id` route
   * with the action it was deep-linked with; any recorded action still present
   * is consumed so nothing ever double-executes.
   */
  async function resolveNativePendingAction(
    jobId: string,
    action: 'accept' | 'decline',
  ): Promise<void> {
    // Clear whatever the native side recorded first, so a later boot/resume can
    // never re-run this decision.
    await consumeNativePendingAction();

    if (action === 'accept') {
      try {
        await jobsApi.accept(jobId);
      } catch {
        // The claim failed (already taken, expired, offline); the error is
        // server truth and the native alert is dropped below regardless.
      }
    } else {
      try {
        await jobsApi.decline(jobId);
      } catch {
        // A stale/unknown job declines nowhere; dropping it natively is correct.
      }
    }

    void clearNativeJobAlert(jobId);
  }

  function cleanup(): void {
    socketUnsubscribes.forEach((off) => off());
    socketUnsubscribes.length = 0;
    isInitialized = false;
  }

  return {
    initialize,
    resolveNativePendingAction,
    cleanup,
  };
}

export const jobNotificationService = createJobNotificationService();