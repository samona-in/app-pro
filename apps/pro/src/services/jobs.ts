import type {
  AvailableJobDto,
  JobOfferDto,
  JobOfferStatus,
  ProProfile,
  ServiceRequestDto,
} from '@samona/types';
import type { AvailabilityPatchInput } from '@samona/validation';
import { api } from './api';

/**
 * Typed lifecycle requests for the Pro surface.
 *
 * Thin functions over the shared `api` client. The server is the only writer of
 * statuses, distances, prices and availability; these merely state what the Pro
 * wants. The empty `{}` bodies on offers are deliberate — the server schemas
 * are `strictObject` and expect a JSON object, not an empty body.
 */
export type ProJobTransitionAction = 'travel' | 'arrived' | 'start' | 'complete';

export interface RespondOfferResult {
  offerStatus: JobOfferStatus;
  requestId: string;
}

export const jobsApi = {
  /** The caller's confirmed and in-flight jobs, newest first. */
  list: (options: { status?: string; limit?: number } = {}) =>
    api.get<ServiceRequestDto[]>('/pros/jobs', { query: options }),

  /** Instant-dispatch offers for the caller. */
  offers: (options: { status?: string; limit?: number } = {}) =>
    api.get<JobOfferDto[]>('/pros/job-offers', { query: options }),

  /** Open requests the caller is eligible to serve. */
  available: (options: { limit?: number; offset?: number } = {}) =>
    api.get<AvailableJobDto[]>('/pros/available-jobs', { query: options }),

  acceptOffer: (offerId: string) =>
    api.post<RespondOfferResult>(`/pros/job-offers/${offerId}/accept`, {}),

  declineOffer: (offerId: string) =>
    api.post<RespondOfferResult>(`/pros/job-offers/${offerId}/decline`, {}),

  expressInterest: (serviceRequestId: string) =>
    api.post<ServiceRequestDto>('/pros/pro-interests', { serviceRequestId }),

  transition: (jobId: string, action: ProJobTransitionAction, note?: string) =>
    api.post<ServiceRequestDto>(`/pros/jobs/${jobId}/${action}`, note ? { note } : {}),

  setAvailability: (patch: AvailabilityPatchInput) =>
    api.post<ProProfile>('/pros/availability', patch),
};