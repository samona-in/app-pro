import type { ServiceRequestDto } from '@samona/types';
import { api } from './api';

/**
 * Payment surface for the customer.
 *
 * V1 exposes one action — settle a completed request. The amount is anchored
 * server-side at completion, so the app only confirms the payment.
 */
export const paymentsApi = {
  markPaid: (requestId: string) =>
    api.post<ServiceRequestDto>(`/payments/requests/${requestId}/mark-paid`, {}),
};