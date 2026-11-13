import type { JobBatchResult, JobDetail } from '@samona/types';
import type { CreateJobBatchRequest, CreateJobRequest } from '@samona/validation';
import { api } from './api';

/**
 * Typed booking requests for the customer surface, mounted at `/jobs`.
 *
 * Thin functions over the shared `api` client — REST stays the source of truth
 * (CLAUDE.md "Realtime"). The server is the only writer of prices and statuses;
 * the customer states what they need and pays their professional in cash once
 * the work is done — there is no online payment.
 */
export const bookingApi = {
  /** The caller's booking history, newest first. */
  list: (options: { limit?: number } = {}) => api.get<JobDetail[]>('/jobs', { query: options }),

  /** Files a new single-service booking; matching nudges eligible pros. */
  create: (input: CreateJobRequest) => api.post<JobDetail>('/jobs', input),

  /**
   * Places one checkout spanning one or more services.
   *
   * Each service becomes its own independent booking, all sharing an
   * `orderGroupId`. The whole checkout is atomic: if any service or work is
   * invalid, no booking is created.
   */
  createBatch: (input: CreateJobBatchRequest) =>
    api.post<JobBatchResult>('/jobs/batch', input),

  /** One booking, including the assigned professional when there is one. */
  get: (jobId: string) => api.get<JobDetail>(`/jobs/${jobId}`),

  /** Cancels a booking that is still cancellable. */
  cancel: (jobId: string, note?: string) =>
    api
      .post<{ detail: JobDetail; customerUserId: string; proUserId: string | null }>(
        `/jobs/${jobId}/cancel`,
        note ? { note } : {},
      )
      .then((res) => res.detail),
};
