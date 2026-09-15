import { Platform } from 'react-native';
import { create } from 'zustand';
import {
  clearStoredCancellation,
  loadStoredCancellations,
  presentStoredCancellation,
} from '@/services/cancellation-storage';
import { startCancellationVibration, stopCancellationVibration } from '@/utils/cancellation-vibration';

/**
 * Unacknowledged customer-initiated cancellations of jobs the pro was assigned
 * to.
 *
 * One logical event per job. The backend marks *who* cancelled on the job
 * detail (`cancelledBy`), so self-cancels never reach this store while a
 * customer walk-away always does. The alert is deliberately global, not tied to
 * the job screen: the job is gone the moment it is cancelled, so there is no
 * detail screen left to host the acknowledgement — the Home screen shows the
 * modal instead. The first venue to notice a cancellation (the realtime
 * `job:status` event while the app is alive, the FCM push while backgrounded or
 * killed) presents exactly one vibration and one modal; `raise` is idempotent
 * per `jobId` and lets the native store deduplicate across surfaces.
 *
 * State is presentational only — the backend stays the source of truth, and
 * acknowledging a cancellation never writes anything to the server (there is
 * nothing left to change: the job is already CANCELLED).
 */
export interface CancellationEvent {
  jobId: string;
  /** Server-stamped ISO timestamp of the cancellation. */
  cancelledAt: string;
  /** The service name when the detail was in the payload (socket path). */
  serviceName: string | null;
}

interface JobCancellationState {
  cancellations: Record<string, CancellationEvent>;
  /**
   * Raise one cancellation. Returns true when this is the first presentation
   * the app has seen for that job (the caller may use it to gate a vibration
   * on surfaces that vibrate in JS).
   */
  raise: (
    event: CancellationEvent & { showNotification: boolean },
  ) => Promise<boolean>;
  /** Acknowledges (drops) the cancellation for `jobId` on every surface. */
  acknowledge: (jobId: string) => Promise<void>;
  /** Merges in whatever the native store persisted, without re-alerting. */
  rehydrateFromNative: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useJobCancellationStore = create<JobCancellationState>((set, get) => ({
  cancellations: {},

  raise: async ({ jobId, cancelledAt, serviceName, showNotification }) => {
    const existing = get().cancellations[jobId];
    const isFirstOfEvent = !existing;

    // Native-present first: the store knows whether the FCM push already
    // raised this exact cancellation (Android). Its `isNew` is the single
    // deduplication anchor across socket and push — whichever wins starts the
    // one vibration; the other skips.
    let nativeIsNew = false;
    try {
      nativeIsNew = await presentStoredCancellation(jobId, cancelledAt, showNotification);
    } catch {
      nativeIsNew = false;
    }

    set((state) => ({
      cancellations: {
        ...state.cancellations,
        [jobId]: { jobId, cancelledAt, serviceName: serviceName ?? existing?.serviceName ?? null },
      },
    }));

    // Vibrate only when this is genuinely the first presentation anywhere:
    // JS-first on surfaces without a native venue (iOS), or native-first on
    // Android when the push had not beaten the socket to it. Re-raises of an
    // already-seen job and rehydrates never vibrate twice.
    if (isFirstOfEvent && (Platform.OS !== 'android' || nativeIsNew)) {
      startCancellationVibration();
    }
    return isFirstOfEvent;
  },

  acknowledge: async (jobId) => {
    stopCancellationVibration();
    await clearStoredCancellation(jobId);
    set((state) => {
      if (!(jobId in state.cancellations)) return state;
      const rest = { ...state.cancellations };
      delete rest[jobId];
      return { cancellations: rest };
    });
  },

  rehydrateFromNative: async () => {
    let stored: Array<{ jobId: string; cancelledAt: string }> = [];
    try {
      stored = await loadStoredCancellations();
    } catch {
      return;
    }
    set((state) => {
      const next = { ...state.cancellations };
      for (const item of stored) {
        // Keep the richer JS copy when present (it may carry the service name);
        // the cancellation identity is the same timeless event either way.
        if (!next[item.jobId]) {
          next[item.jobId] = { jobId: item.jobId, cancelledAt: item.cancelledAt, serviceName: null };
        }
      }
      return { cancellations: next };
    });
  },

  clearAll: async () => {
    for (const jobId of Object.keys(get().cancellations)) {
      await clearStoredCancellation(jobId);
    }
    stopCancellationVibration();
    set({ cancellations: {} });
  },
}));

/** The most recent unacknowledged cancellation, or null when none is pending. */
export function selectLatestUnacknowledged(
  state: JobCancellationState,
): CancellationEvent | null {
  const [head, ...rest] = Object.values(state.cancellations);
  if (!head) return null;
  let latest = head;
  for (const event of rest) {
    if (Date.parse(event.cancelledAt) > Date.parse(latest.cancelledAt)) latest = event;
  }
  return latest;
}

/**
 * The number of unacknowledged cancellations (e.g. a badge while more than one
 * job was cancelled before the pro could acknowledge).
 */
export function countUnacknowledged(state: JobCancellationState): number {
  return Object.keys(state.cancellations).length;
}