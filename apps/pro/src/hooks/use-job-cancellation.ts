import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { JobStatus, type JobDetail } from '@samona/types';
import { queryKeys } from '@/constants';
import { subscribe } from '@/services/realtime';
import { useJobCancellationStore } from '@/stores/job-cancellation';
import { startCancellationVibration } from '../utils/cancellation-vibration';
import { useSession } from './use-session';

/**
 * Feeds the global unacknowledged customer-cancellation collection.
 *
 * Every venue that can learn "the customer cancelled a job the pro was assigned
 * to" lands here, keyed by `jobId`, and the store deduplicates to one alert:
 *
 *  - realtime `job:status` (status CANCELLED, `cancelledBy` 'customer') while
 *    the app is alive — the primary surface. The same event also invalidates
 *    the jobs queries, so the active-job route redirects home where the modal
 *    presents;
 *  - while backgrounded/killed (Android), the native AlertStore records the
 *    FCM-presented cancellation; this hook rehydrates it on mount and on every
 *    return to the active AppState;
 *  - a foreground push fallback (`JOB_CANCELLED_ASSIGNED`) for surfaces without
 *    the native module (iOS).
 *
 * Self-cancels never alert: the backend marks `cancelledBy: 'pro'` and this
 * hook ignores anything but a customer cancellation.
 */
export function useJobCancellation() {
  const { isAuthenticated } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Rehydrate on mount and whenever the app returns to the foreground — a
  // cancellation raised by the FCM path (screen off, killed, socket down) must
  // not be lost. Rehydrate never re-vibrates: the native side already presented
  // it at delivery.
  useEffect(() => {
    void useJobCancellationStore.getState().rehydrateFromNative();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useJobCancellationStore.getState().rehydrateFromNative();
      }
    });
    return () => subscription.remove();
  }, []);

  // Realtime. Subscribed once authenticated for the same reason as the offers
  // hook: the socket connects on auth, so a listener attached earlier would
  // live on a socket that gets torn down and recreated.
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = subscribe('job:status', (detail: JobDetail) => {
      // Gate on the *accepted* state, never the status alone: a CANCELLED
      // event for a job the pro never accepted (only ever held a pending
      // offer) must drop silently — the offer-holder's offer is removed by
      // use-incoming-offers, and no alert/vibration/navigation should happen.
      // The server stamps `acceptedAt` on sale/assignment and never clears it
      // on cancel, so `acceptedAt != null` is the reliable discriminator.
      if (detail.status !== JobStatus.CANCELLED) return;
      if (detail.cancelledBy !== 'customer') return;
      if (detail.acceptedAt == null) return;
      // Present immediately — the ring and the store entry do not wait on
      // navigation, so the pro gets instant feedback.
      startCancellationVibration();
      void useJobCancellationStore.getState().raise({
        jobId: detail.id,
        cancelledAt: detail.cancelledAt ?? new Date().toISOString(),
        serviceName: detail.service?.name ?? null,
        showNotification: AppState.currentState !== 'active',
      });
      // Req 3: don't gamble on the query-driven redirect alone. Whatever
      // screen the pro is on, explicitly return to Home so the modal (which
      // presents on Home) reliably appears — but only after the assigned-jobs
      // cache is fresh. The same event's realtime bridge invalidates the
      // queries asynchronously, so Home's focus gate can otherwise read the
      // pre-cancel list, find the job still "active", and bounce the pro
      // straight back into the cancelled job's screens.
      void (async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.jobs.all });
        router.replace('/home');
      })();
    });
    return unsubscribe;
  }, [isAuthenticated, queryClient, router]);
}
/**
 * Mounted once by the root providers (as JSX, like {@link IncomingOffersSync})
 * to feed the unacknowledged customer-cancellation collection for the whole
 * signed-in app. Rendering-null: every effect lives in the hook.
 */
export function JobCancellationSync() {
  useJobCancellation();
  return null;
}
