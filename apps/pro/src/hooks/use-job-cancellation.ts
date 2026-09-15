import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Role from 'expo-role';
import { JobStatus, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { useJobCancellationStore } from '@/stores/job-cancellation';
import { startCancellationVibration, stopCancellationVibration } from '../utils/cancellation-vibration';
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

  useEffect(() => {
    void useJobCancellationStore.getState().rehydrateFromNative();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useJobCancellationStore.getState().rehydrateFromNative();
      }
    });
    return () => subscription.remove();
  }, []);

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
      // Req 3: don't gamble on the query-driven redirect alone. Whatever
      // screen the pro is on, explicitly return to Home so the modal (which
      // presents on Home) reliably appears.
      router.replace('/home');
      startCancellationVibration();
      void useJobCancellationStore.getState().raise({
        jobId: detail.id,
        cancelledAt: detail.cancelledAt ?? new Date().toISOString(),
        serviceName: detail.service?.name ?? null,
        showNotification: AppState.currentState !== 'active',
      });
    });
    return unsubscribe;
  }, [isAuthenticated]);
}
