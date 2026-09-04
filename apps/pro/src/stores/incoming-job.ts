import { create } from 'zustand';
import type { AvailableJob } from '@samona/types';

/**
 * Client-side state for the incoming-job alert overlay. Jobs are queued so a
 * pro never misses a request. The first element in the queue is the
 * currently-displayed job; new arrivals append to the end.
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
  /** Remaining jobs waiting behind the active one. */
  pendingJobs: AvailableJob[];
  /**
   * Non-null once the active job has been resolved. The overlay holds briefly
   * on a resolution before advancing to the next job (or dismissing).
   */
  resolution: IncomingJobResolution | null;
  /** Enqueue a job. If nothing is active, show it immediately. */
  enqueue: (job: AvailableJob) => void;
  /** Marks which event ended the alert for the active job. */
  resolve: (resolution: IncomingJobResolution) => void;
  /** Advance to the next queued job after a resolution hold. */
  advance: () => void;
  /** Remove a specific job from the queue (e.g. cancelled by another pro). */
  remove: (jobId: string) => void;
  /** Clears the current job AND all pending jobs. */
  clear: () => void;
}

export const useIncomingJobStore = create<IncomingJobState>((set) => ({
  job: null,
  pendingJobs: [],
  resolution: null,

  enqueue: (job) =>
    set((state) => {
      // Duplicate of the currently-displayed job — no-op.
      if (state.job && state.job.id === job.id) return state;

      // Duplicate of a queued job — no-op.
      if (state.pendingJobs.some((j) => j.id === job.id)) return state;

      // Nothing active — show immediately.
      if (!state.job) {
        return { job, pendingJobs: state.pendingJobs, resolution: null };
      }

      // A job is active — append to the back of the queue.
      return { pendingJobs: [...state.pendingJobs, job] };
    }),

  resolve: (resolution) =>
    set((state) =>
      // The first event to resolve the pending request wins; later events (e.g.
      // a `job:status` echo of an accept already acted on) must not downgrade it.
      state.job && !state.resolution ? { resolution } : state,
    ),

  advance: () =>
    set((state) => {
      if (state.pendingJobs.length === 0) {
        return { job: null, pendingJobs: [], resolution: null };
      }
      const [next, ...rest] = state.pendingJobs;
      return { job: next, pendingJobs: rest, resolution: null };
    }),

  remove: (jobId) =>
    set((state) => {
      // If the active job is the one being removed, advance to the next.
      if (state.job?.id === jobId) {
        if (state.pendingJobs.length === 0) {
          return { job: null, pendingJobs: [], resolution: null };
        }
        const [next, ...rest] = state.pendingJobs;
        return { job: next, pendingJobs: rest, resolution: null };
      }

      // Otherwise filter it out of the pending queue.
      const filtered = state.pendingJobs.filter((j) => j.id !== jobId);
      if (filtered.length === state.pendingJobs.length) return state;
      return { pendingJobs: filtered };
    }),

  clear: () => set({ job: null, pendingJobs: [], resolution: null }),
}));
