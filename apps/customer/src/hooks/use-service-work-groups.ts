import { useQuery } from '@tanstack/react-query';
import type { ServiceWithWorkGroups } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/** Active category groups and customer-visible works for a service. */
export function useServiceWorkGroups(serviceSlug: string) {
  return useQuery({
    queryKey: queryKeys.serviceWorkGroups(serviceSlug),
    queryFn: () => api.get<ServiceWithWorkGroups>(`/services/${serviceSlug}/groups`),
    enabled: Boolean(serviceSlug),
    staleTime: 60 * 60_000,
  });
}
