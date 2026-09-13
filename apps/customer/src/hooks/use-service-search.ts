import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/query-keys';
import { catalogueApi } from '@/services/catalogue';

export function useServiceSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.search.results(query),
    queryFn: () => catalogueApi.searchServices(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}
