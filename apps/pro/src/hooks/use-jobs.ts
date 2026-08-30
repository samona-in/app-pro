import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobOfferStatus, ServiceRequestStatus } from '@samona/types';
import type { AvailabilityPatchInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { jobsApi, type ProJobTransitionAction } from '@/services/jobs';

/** The caller's confirmed and in-flight jobs. */
export function useProJobs(status?: ServiceRequestStatus) {
  return useQuery({
    queryKey: queryKeys.jobs.list(status),
    queryFn: () => jobsApi.list({ status }),
    staleTime: 30_000,
  });
}

/**
 * Instant dispatch offers.
 *
 * Offers live for seconds, so a short refetch keeps countdowns and the
 * expired/answered boundary honest even if a realtime event is missed.
 */
export function useProOffers(status?: JobOfferStatus) {
  return useQuery({
    queryKey: queryKeys.jobs.offers(status),
    queryFn: () => jobsApi.offers({ status }),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** Open requests the caller can browse and express interest in. */
export function useAvailableJobs() {
  return useQuery({
    queryKey: queryKeys.jobs.available,
    queryFn: () => jobsApi.available(),
    staleTime: 30_000,
  });
}

/**
 * The online/offline switch. Optimistic UI lives in the app store; this
 * mutation writes the authoritative value on the server and reflects it back
 * into the profile cache.
 */
export function useToggleAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AvailabilityPatchInput) => jobsApi.setAvailability(patch),
    onSuccess: (proProfile) => {
      queryClient.setQueryData(queryKeys.proProfile, proProfile);
      // The session carries the profile behind routing decisions; nothing here
      // changed it, but keeping it in sync is one cheap invalidation.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

/** Accepts or declines one dispatch offer. */
export function useRespondToOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, action }: { offerId: string; action: 'accept' | 'decline' }) =>
      action === 'accept' ? jobsApi.acceptOffer(offerId) : jobsApi.declineOffer(offerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

/** Expresses interest in an open request. */
export function useExpressInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serviceRequestId: string) => jobsApi.expressInterest(serviceRequestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

/** Advances an assigned job through the on-site stages. */
export function useTransitionJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: ProJobTransitionAction }) =>
      jobsApi.transition(jobId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}