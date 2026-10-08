import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProServiceListItem } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/**
 * Every active service merged with the caller's own verification status — the
 * Manage Services screen's data. `status: null` marks a service never
 * requested, which is what the Request button acts on.
 */
export function useProServices() {
  return useQuery({
    queryKey: queryKeys.proServices,
    queryFn: () => api.get<ProServiceListItem[]>('/pros/services'),
    staleTime: 30_000,
  });
}

/**
 * Requests verification for one service, or re-requests it after rejection.
 *
 * Only ever moves a row towards PENDING — approval stays admin-side. The list
 * is refetched rather than patched so the row shows whatever state actually
 * landed (a double-tap or an admin decision in flight reads back correctly),
 * and the profile is invalidated because the home services card reads
 * `proProfile.proServices` too.
 */
export function useRequestProService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serviceId: string) =>
      api.post<ProServiceListItem>(`/pros/services/${serviceId}/request`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.proServices });
      void queryClient.invalidateQueries({ queryKey: queryKeys.proProfile });
    },
  });
}
