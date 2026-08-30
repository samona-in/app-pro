import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobStatus } from '@samona/types';
import type { AvailabilityPatchInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { jobsApi, type ProJobTransitionAction } from '@/services/jobs';

/** The caller's own assigned jobs. */
export function useProJobs(status?: JobStatus) {
  return useQuery({
    queryKey: queryKeys.jobs.list(status),
    queryFn: () => jobsApi.list({ status }),
    staleTime: 30_000,
  });
}

/**
 * Open jobs the caller can take. A short refetch keeps the pool honest even if
 * a `job:new` nudge is missed while the app was backgrounded.
 */
export function useAvailableJobs() {
  return useQuery({
    queryKey: queryKeys.jobs.available,
    queryFn: () => jobsApi.available(),
    staleTime: 20_000,
    refetchInterval: 20_000,
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

/** Accepts one open job. The server keeps the claim atomic. */
export function useAcceptJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => jobsApi.accept(jobId),
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

/** Cancels a job the pro is party to. */
export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, note }: { jobId: string; note?: string }) => jobsApi.cancel(jobId, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}