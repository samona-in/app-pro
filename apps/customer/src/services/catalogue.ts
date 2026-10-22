import type { PopularSkill, ServiceOption, ServiceSearchResult } from '@samona/types';
import { api } from './api';

/**
 * The shared service catalogue, mounted at `/services`.
 *
 * Any authenticated user can read it: a customer picks a service to request,
 * a professional picks theirs during onboarding.
 */
export const catalogueApi = {
  listServices: () => api.get<ServiceOption[]>('/services'),
  listPopularSkills: () => api.get<PopularSkill[]>('/services/popular-skills'),
  searchServices: (q: string) =>
    api.get<ServiceSearchResult>(`/services/search?q=${encodeURIComponent(q)}`),
};
