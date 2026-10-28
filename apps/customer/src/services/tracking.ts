import { api } from './api';

export const customerTrackingService = {
  getStatus: (bookingId: string) => api.get(`/tracking/${bookingId}/status`),
  getLatest: (bookingId: string) => api.get(`/tracking/${bookingId}/location`),
};
