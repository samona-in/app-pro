import { api } from './api';

export const proTrackingService = {
  updateLocation: (body: any) => api.post('/tracking/location', body),
  getStatus: (bookingId: string) => api.get(`/tracking/${bookingId}/status`),
  getLatest: (bookingId: string) => api.get(`/tracking/${bookingId}/location`),
};
