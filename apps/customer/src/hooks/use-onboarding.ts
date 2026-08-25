import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerProfile } from '@samona/types';
import type { CustomerOnboardingPatchInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/** The caller's customer profile. */
export function useCustomerProfile() {
  return useQuery({
    queryKey: queryKeys.customerProfile,
    queryFn: () => api.get<CustomerProfile>('/customers/me'),
    staleTime: 30_000,
  });
}

/**
 * Saves one onboarding step for the customer.
 */
export function useSaveOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: CustomerOnboardingPatchInput) =>
      api.patch<CustomerProfile>('/customers/me/onboarding', patch),
    onSuccess: (customerProfile) => {
      queryClient.setQueryData(queryKeys.customerProfile, customerProfile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
