import type { ServiceOption } from '@samona/types';
import { api } from './api';

/**
 * The shared service catalogue, mounted at `/services`.
 *
 * Any authenticated user can read it: a customer picks a service to request,
 * a professional picks theirs during onboarding.
 */
export const catalogueApi = {
  listServices: () => api.get<ServiceOption[]>('/services'),
};
