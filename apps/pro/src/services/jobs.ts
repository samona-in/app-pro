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

  /**
   * Open, eligible jobs in the caller's pool — the "job pool" feed. The server
   * gates every job by the same matching predicate used for offers (online,
   * onboarded, serving the service, inside the radius, not busy), nearest
   * first, so the pool always equals the offers this pro would receive.
   */
  available: (options: { limit?: number } = {}) =>
    api.get<AvailableJob[]>('/jobs/available', { query: options }),

  /** Accepts an open job. The first eligible pro to claim it wins. */
  accept: (jobId: string) => api.post<JobDetail>(`/jobs/${jobId}/accept`, {}),

  /**
   * Records this pro's decline of an open request. Idempotent server-side; the
   * request stops resurfacing for them (feed, push scheduler, alert refetch).
   */
  decline: (jobId: string) => api.post<void>(`/jobs/${jobId}/decline`, {}),

  /** Advances an assigned job through one on-site stage. */
  transition: (
    jobId: string,
    action: ProJobTransitionAction,
    note?: string,
    coordinates?: { latitude: number; longitude: number },
  ) => {
    const body: Record<string, unknown> = { action };
    if (note) body.note = note;
    // The server requires the pro's live position to "start work" so it can
    // verify they are actually at the work spot.
    if (coordinates) body.coordinates = coordinates;
    return api.post<JobDetail>(`/jobs/${jobId}/transition`, body);
  },

  /** Cancels a job the caller is party to, before it leaves cancellation land. */
  cancel: (jobId: string, note?: string) =>
    api.post<JobDetail>(`/jobs/${jobId}/cancel`, note ? { note } : {}),

  /**
   * Verifies the start-work code the customer read out to the pro, advancing
   * the job ARRIVED → IN_PROGRESS. The code is only ever handed to the customer
   * (never returned on the pro's API view), so this submits what the pro reads
   * from the customer's screen.
   */
  verify: (jobId: string, code: string) =>
    api.post<JobDetail>(`/jobs/${jobId}/verify`, { action: 'start', code }),

  /**
   * Marks a completed job as settled in cash on the doorstep (PAID). Idempotent
   * server-side — a double-tap on "Collected cash" is a harmless no-op.
   */
  collectCash: (jobId: string) => api.post<JobDetail>(`/jobs/${jobId}/collect-cash`, {}),

  setAvailability: (patch: AvailabilityPatchInput) =>
    api.post<ProProfile>('/pros/availability', patch),
};
