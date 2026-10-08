import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/** The Service Areas endpoint answers with the single field it owns. */
export interface ServiceRadiusResponse {
  serviceRadiusKm: number;
}

/**
 * Saves the Service Areas screen's radius.
 *
 * The endpoint returns just `serviceRadiusKm`, so the cached profile is
 * patched with it rather than replaced wholesale — the rest of the profile is
 * untouched and stays fresh. Matching reads the same column, so whatever lands
 * here immediately changes which jobs reach the pro.
 */
export function useUpdateServiceRadius() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serviceRadiusKm: number) =>
      api.patch<ServiceRadiusResponse>('/pros/me/service-radius', { serviceRadiusKm }),
    onSuccess: ({ serviceRadiusKm }) => {
      queryClient.setQueryData<ProProfile>(queryKeys.proProfile, (old) =>
        old ? { ...old, serviceRadiusKm } : old,
      );
    },
  });
}