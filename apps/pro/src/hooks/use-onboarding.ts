import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProProfile, ServiceOption, SkillOption } from '@samona/types';
import type { OnboardingPatchInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

interface Catalogue {
  services: ServiceOption[];
  skills: SkillOption[];
}

/** The service and specialty catalogue offered in onboarding. */
export function useCatalogue() {
  return useQuery({
    queryKey: queryKeys.catalogue,
    queryFn: () => api.get<Catalogue>('/pros/catalogue'),
    // Reference data: it changes rarely and never per user.
    staleTime: 60 * 60_000,
  });
}

/** The caller's professional profile. */
export function useProProfile() {
  return useQuery({
    queryKey: queryKeys.proProfile,
    queryFn: () => api.get<ProProfile>('/pros/me'),
    staleTime: 30_000,
  });
}

/**
 * Saves one onboarding step.
 *
 * Each step persists on its own so a Pro who closes the app keeps the answers
 * already given. The server recomputes onboarding status from the result, so
 * the returned profile is authoritative and is written straight into the cache
 * — including the session, whose routing decision depends on it.
 */
export function useSaveOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: OnboardingPatchInput) =>
      api.patch<ProProfile>('/pros/me/onboarding', patch),
    onSuccess: (proProfile) => {
      queryClient.setQueryData(queryKeys.proProfile, proProfile);
      // The session carries onboardingStatus and nextStep; both just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
