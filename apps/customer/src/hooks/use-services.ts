import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { catalogueApi } from '@/services/catalogue';

/** The active service catalogue for "what do you need today?". */
export function useServices() {
  return useQuery({
    queryKey: queryKeys.catalogue,
    queryFn: () => catalogueApi.listServices(),
    // The catalogue is stable; a long staleTime avoids refetch churn.
    staleTime: 60_000,
  });
}
