import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { JobStatus, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { useJobCancellationStore } from '@/stores/job-cancellation';
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
      // on cancel, so `acceptedAt != null` is the reliable "did the pro accept
      // this job" discriminator.
      if (detail.status !== JobStatus.CANCELLED) return;
      if (detail.cancelledBy !== 'customer') return;
      if (detail.acceptedAt == null) return;
      if (isFirstOfEvent) {
        // Req 3: don't gamble on the query-driven redirect alone. Whatever
        // screen the pro is on, explicitly return to Home so the modal (which
        // presents on Home) reliably appears.
        router.replace('/home');
        if (vibrationShouldPresent()) startCancellationVibration();
      }
      void useJobCancellationStore.getState().raise({
        jobId: detail.id,
        cancelledAt: detail.cancelledAt ?? new Date().toISOString(),
        serviceName: detail.service?.name ?? null,
        // Foreground socket path: the JS modal (Home) is the presentation, so
        // no native tray. A backgrounded-but-alive socket (screen off, online
        // foreground service) still gets the native tray + vibration.
        showNotification: AppState.currentState !== 'active',
      });
    });
    return unsubscribe;
  }, [isAuthenticated]);

  // Foreground push fallback for surfaces without the native module. On Android
  // `JOB_CANCELLED_ASSIGNED` is intercepted and presented by the native service
  // (recorded for rehydrate), so that path never reaches here.
  useEffect(() => {
    if (Platform.OS === 'android') return;
    const handler = (notification: Notifications.Notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
      if (data.type !== 'JOB_CANCELLED_ASSIGNED') return;
      const jobId = typeof data.jobId === 'string' ? data.jobId : null;
      const cancelledAt =
        typeof data.cancelledAt === 'string' ? data.cancelledAt : new Date().toISOString();
      if (!jobId) return;
      void useJobCancellationStore.getState().raise({
        jobId,
        cancelledAt,
        serviceName: null,
        showNotification: false,
      });
    };
    const subscription = Notifications.addNotificationReceivedListener(handler);
    return () => subscription.remove();
  }, []);
}

/**
 * Mounted once inside the app providers so the cancellation collection is fed
 * for as long as the signed-in app lives — independent of which screen is open.
 */
export function JobCancellationSync() {
  useJobCancellation();
  return null;
}