import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobStatus } from '@samona/types';
import type { AvailabilityPatchInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { jobsApi, type ProJobTransitionAction } from '@/services/jobs';

/** The caller's own assigned jobs. */
export function useProJobs(status?: JobStatus, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.jobs.list(status),
    queryFn: () => jobsApi.list({ status }),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

/**
 * The pro's job-request history — every request offered, newest first,
 * including requests nobody accepted. Powers the "past jobs" Jobs tab.
 */
export function useJobHistory() {
  return useQuery({
    queryKey: queryKeys.jobs.history,
    queryFn: () => jobsApi.history(),
    staleTime: 60_000,
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
    mutationFn: ({
      jobId,
      action,
      coordinates,
    }: {
      jobId: string;
      action: ProJobTransitionAction;
      coordinates?: { latitude: number; longitude: number };
    }) => jobsApi.transition(jobId, action, undefined, coordinates),
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

/**
 * Verifies the start-work code the customer read to the pro, moving the job
 * ARRIVED → IN_PROGRESS on the server.
 */
export function useVerifyStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, code }: { jobId: string; code: string }) =>
      jobsApi.verify(jobId, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}

/**
 * Settles a completed job in cash on the doorstep. The server walks the job to
 * PAID (idempotent once paid), so a double-tap on "Collected cash" is safe.
 */
export function useCollectCash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => jobsApi.collectCash(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    },
  });
}
