import type { JobDetail } from '@samona/types';
import type { CreateJobInput } from '@samona/validation';
import { api } from './api';

/**
 * Typed booking requests for the customer surface, mounted at `/jobs`.
 *
 * Thin functions over the shared `api` client — REST stays the source of truth
 * (CLAUDE.md "Realtime"). The server is the only writer of prices and statuses;
 * the customer states what they need and settles what was completed.
 */
export const bookingApi = {
  /** The caller's booking history, newest first. */
  list: (options: { limit?: number } = {}) => api.get<JobDetail[]>('/jobs', { query: options }),

  /** Files a new booking; matching nudges eligible pros. */
  create: (input: CreateJobInput) => api.post<JobDetail>('/jobs', input),

  /** One booking, including the assigned professional when there is one. */
  get: (jobId: string) => api.get<JobDetail>(`/jobs/${jobId}`),

  /** Settles a completed booking; the amount was anchored server-side. */
  pay: (jobId: string) => api.post<JobDetail>(`/jobs/${jobId}/pay`, {}),

  /** Cancels a booking that is still cancellable. */
  cancel: (jobId: string, note?: string) =>
    api
      .post<{ detail: JobDetail; customerUserId: string; proUserId: string | null }>(
        `/jobs/${jobId}/cancel`,
        note ? { note } : {},
      )
      .then((res) => res.detail),
};
