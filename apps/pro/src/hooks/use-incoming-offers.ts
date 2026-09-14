import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { isActiveJobStatus, JobStatus, type AvailableJob, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { clearNativeJobAlert } from '@/services/overlay-alert';
import {
  toPendingOfferFromAvailableJob,
  toPendingOfferFromPushData,
  useIncomingOffersStore,
} from '@/stores/incoming-offers';
import { useSession } from './use-session';
import { useProJobs } from './use-jobs';

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

const TERMINAL_PUSH_TYPES = new Set(['JOB_ACCEPTED', 'JOB_CANCELLED', 'JOB_EXPIRED']);

/**
 * Feeds and prunes the in-app pending-offers collection.
 *
 * Live offers reach the app two ways, and both land here keyed by `jobId` (so
 * FCM + socket for the same job can never duplicate):
 *
 *  - realtime `job:new` upserts a new offer; realtime `job:status` drops an
 *    offer the moment it is claimed, cancelled or expired;
 *  - while the process is backgrounded or killed, the native AlertStore keeps
 *    the offers and this hook rehydrates them (`getPendingNativeJobs()`) when
 *    the app comes back to the foreground.
 *
 * Offers only belong to a free pro: the moment an active job appears the whole
 * collection is dropped, and nothing is auto-presented while busy. When a new
 * offer lands with the app foregrounded and the incoming-jobs screen closed,
 * the screen is auto-opened — and because the store is keyed by jobId, further
 * offers just append/update it instead of reopening it.
 */
export function useIncomingOffers() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated, isOnboardingComplete } = useSession();
  const jobsQuery = useProJobs(undefined, {
    enabled: isAuthenticated && isOnboardingComplete && !isLoading,
  });
  const jobs = jobsQuery.data ?? [];
  const hasActiveJob = jobs.some((job) => isActiveJobStatus(job.status));

  const count = useIncomingOffersStore((state) => Object.keys(state.offersById).length);
  const previousCountRef = useRef(0);

  // Advance the countdown clock and prune expired offers once a second.
  useEffect(() => {
    const id = setInterval(() => useIncomingOffersStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);

  // Rehydrate from the native store on mount and whenever the app returns to
  // the foreground — offers that arrived while backgrounded must not be lost.
  useEffect(() => {
    void useIncomingOffersStore.getState().rehydrateFromNative();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useIncomingOffersStore.getState().rehydrateFromNative();
      }
    });
    return () => subscription.remove();
  }, []);

  // Realtime: live offers upsert, terminal states drop the matching offer.
  useEffect(() => {
    const unsubscribes = [
      subscribe('job:new', (job: AvailableJob) => {
        useIncomingOffersStore.getState().upsert(toPendingOfferFromAvailableJob(job));
      }),
      subscribe('job:status', (detail: JobDetail) => {
        if (UNAVAILABLE_STATUSES.has(detail.status)) {
          useIncomingOffersStore.getState().remove(detail.id);
          void clearNativeJobAlert(detail.id);
        }
      }),
    ];
    return () => {
      for (const off of unsubscribes) off();
    };
  }, []);

  // Foreground push fallback for surfaces without the native overlay (iOS /
  // stale APK without the module). On Android NEW_JOB and terminal pushes are
  // intercepted by the native service, so the listener never fires for them.
  useEffect(() => {
    if (Platform.OS === 'android') return;
    const handler = (notification: Notifications.Notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
      const type = data.type;
      const jobId = typeof data.jobId === 'string' ? data.jobId : null;
      if (!jobId) return;
      if (type === 'NEW_JOB') {
        const offer = toPendingOfferFromPushData(data);
        if (offer) useIncomingOffersStore.getState().upsert(offer);
      } else if (typeof type === 'string' && TERMINAL_PUSH_TYPES.has(type)) {
        useIncomingOffersStore.getState().remove(jobId);
      }
    };
    const subscription = Notifications.addNotificationReceivedListener(handler);
    return () => subscription.remove();
  }, []);

  // Offers only exist for a free pro. The instant a job becomes active (e.g. a
  // native overlay accept landed while the app was closed), drop every pending
  // offer and its native alert — the server will page this pro again later.
  useEffect(() => {
    if (!hasActiveJob) return;
    const state = useIncomingOffersStore.getState();
    const jobIds = Object.keys(state.offersById);
    if (jobIds.length === 0) return;
    state.clearAll();
    for (const jobId of jobIds) void clearNativeJobAlert(jobId);
  }, [hasActiveJob]);

  // Auto-present the combined incoming-jobs screen on a 0 → N transition for a
  // free, ready pro with the app open. When the screen is already showing, the
  // store keys by jobId so new offers update it in place instead of reopening.
  useEffect(() => {
    if (!isAuthenticated || !isOnboardingComplete || hasActiveJob || count === 0) return;
    const previous = previousCountRef.current;
    previousCountRef.current = count;
    if (previous !== 0) return;
    if (pathname === '/incoming-jobs') return;
    router.push('/incoming-jobs');
  }, [count, isAuthenticated, isOnboardingComplete, hasActiveJob, pathname, router]);
}

/**
 * Mounted once inside the app providers so the offers collection is fed for as
 * long as the signed-in app lives — including while the incoming-jobs screen
 * itself is open, where arrivals must append rather than reopen.
 */
export function IncomingOffersSync() {
  useIncomingOffers();
  return null;
}