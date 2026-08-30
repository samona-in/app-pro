import type {
  ServiceRequestDto,
  ServiceRequestStatus,
  RespondingProDto,
} from '@samona/types';
import type { CreateServiceRequestInput, SelectProInput } from '@samona/validation';
import { api } from './api';

/**
 * Typed requests against the customer-facing order lifecycle, mounted at
 * `/service-requests`.
 *
 * Thin functions over the shared `api` client — REST stays the source of truth
 * (CLAUDE.md "Realtime"). The `{}` body on cancel is deliberate: the server
 * schema is `strictObject` and expects a JSON object, not an empty body.
 */
export const requestsApi = {
  /** The caller's request history, newest first. */
  list: (options: { status?: ServiceRequestStatus; limit?: number; offset?: number } = {}) =>
    api.get<ServiceRequestDto[]>('/service-requests', { query: options }),

  /** Files a new request; the backend decides dispatch vs open. */
  create: (input: CreateServiceRequestInput) =>
    api.post<ServiceRequestDto>('/service-requests', input),

  /** One request, including the live shortlist of responding pros. */
  get: (requestId: string) => api.get<ServiceRequestDto>(`/service-requests/${requestId}`),

  /** The shortlist alone — top of the choosing screen. */
  pros: (requestId: string) =>
    api.get<RespondingProDto[]>(`/service-requests/${requestId}/pros`),

  /** Atomically assigns the request to one professional. */
  selectPro: (requestId: string, input: SelectProInput) =>
    api.post<ServiceRequestDto>(`/service-requests/${requestId}/select-pro`, input),

  /** Cancels while the request is still cancellable. */
  cancel: (requestId: string) =>
    api.post<ServiceRequestDto>(`/service-requests/${requestId}/cancel`, {}),
};