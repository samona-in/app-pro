import { create } from 'zustand';
import type { AvailableJob } from '@samona/types';

/**
 * Client-side state for the incoming-job alert overlay. This is UI state only
 * (which job is being shown/alarmed and why it resolved) — job data itself is
 * server state read through TanStack Query (CLAUDE.md "TanStack Query for
 * server state, Zustand only for client/application state").
 */

export type IncomingJobResolution =
  | 'accept'
  | 'reject'
  | 'expired'
  | 'cancelled'
  | 'unavailable';

interface IncomingJobState {
  /** The job currently being alerted, or null when nothing is pending. */
  job: AvailableJob | null;
  /**
   * Non-null once the alert has been resolved. The overlay holds briefly on a
   * resolution before dismissing so the pro sees the outcome.
   */
  resolution: IncomingJobResolution | null;
  /** Shows the incoming-job alert for a job. */
  show: (job: AvailableJob) => void;
  /** Marks which event ended the alert. */
  resolve: (resolution: IncomingJobResolution) => void;
  /** Clears the overlay entirely (after the resolution display, on unmount). */
  clear: () => void;
}

export const useIncomingJobStore = create<IncomingJobState>((set) => ({
  job: null,
  resolution: null,
  show: (job) =>
    set((state) => {
      // If an alert is already showing for the same job (a duplicate `job:new`
      // nudge from the realtime channel), keep it; otherwise adopt the newest
      // request without piling up separate alerts.
      if (state.job && state.job.id === job.id) return state;
      return { job, resolution: null };
    }),
  resolve: (resolution) =>
    set((state) =>
      // The first event to resolve the pending request wins; later events (e.g.
      // a `job:status` echo of an accept already acted on) must not downgrade it.
      state.job && !state.resolution ? { resolution } : state,
    ),
  clear: () => set({ job: null, resolution: null }),
}));
