import type { AvailableJob, JobDetail, JobStatus, ProProfile } from '@samona/types';
import type { AvailabilityPatchInput, JobAction } from '@samona/validation';
import { api } from './api';

/**
 * Typed job requests for the Pro surface.
 *
 * Thin functions over the shared `api` client. The server is the only writer of
 * statuses, distances, prices and availability; these merely state what the Pro
 * wants. The `{ note }` bodies on cancellations are optional — the server
 * schema accepts a JSON object, never a raw string.
 */
export type ProJobTransitionAction = JobAction;
export type { JobAction } from '@samona/validation';

export const jobsApi = {
  /** The caller's own assigned jobs, newest first; filterable by one status. */
  list: (options: { status?: JobStatus; limit?: number } = {}) =>
    api.get<JobDetail[]>('/jobs/mine', { query: options }),

  /** Open, unassigned jobs the caller serves, distance-ordered. */
  available: (options: { limit?: number } = {}) =>
    api.get<AvailableJob[]>('/jobs/available', { query: options }),

  /** Accepts an open job. The first eligible pro to claim it wins. */
  accept: (jobId: string) => api.post<JobDetail>(`/jobs/${jobId}/accept`, {}),

  /** Advances an assigned job through one on-site stage. */
  transition: (jobId: string, action: ProJobTransitionAction, note?: string) =>
    api.post<JobDetail>(`/jobs/${jobId}/transition`, note ? { action, note } : { action }),

  /** Cancels a job the caller is party to, before it leaves cancellation land. */
  cancel: (jobId: string, note?: string) =>
    api.post<JobDetail>(`/jobs/${jobId}/cancel`, note ? { note } : {}),

  setAvailability: (patch: AvailabilityPatchInput) =>
    api.post<ProProfile>('/pros/availability', patch),
};