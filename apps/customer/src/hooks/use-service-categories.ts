import { useQuery } from '@tanstack/react-query';
import type { ServiceOption } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/**
 * The active service categories for the customer home grid.
 *
 * Fetched from the shared services catalogue, ordered as seeded. Reference
 * data is cached aggressively since it rarely changes.
 */
export function useServiceCategories() {
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<ServiceOption[]>('/services'),
    staleTime: 60 * 60_000,
  });
}
