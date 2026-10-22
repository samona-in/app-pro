import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { catalogueApi } from '@/services/catalogue';

/**
 * The skills promoted on the customer home screen.
 *
 * The list is curated server-side and changes rarely, so it is cached for an
 * hour like the rest of the catalogue.
 */
export function usePopularSkills() {
  const query = useQuery({
    queryKey: queryKeys.popularSkills,
    queryFn: () => catalogueApi.listPopularSkills(),
    staleTime: 60 * 60_000,
  });

  // The section is optional: when it fails the home screen still renders
  // without it. Say so rather than failing silently.
  useEffect(() => {
    if (query.isError) {
      console.warn('[usePopularSkills] failed to load popular skills:', query.error);
    }
  }, [query.isError, query.error]);

  return query;
}
