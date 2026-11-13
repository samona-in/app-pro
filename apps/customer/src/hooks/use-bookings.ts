import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobBatchResult, JobDetail, SkillOption } from '@samona/types';
import type { CreateJobBatchRequest, CreateJobRequest } from '@samona/validation';
import { queryKeys } from '@/constants';
import { bookingApi } from '@/services/bookings';
import { api } from '@/services/api';

/** The exact-need categories for one service, in display order. */
export function useServiceSkills(serviceSlug: string) {
  return useQuery({
    queryKey: queryKeys.serviceSkills(serviceSlug),
    queryFn: () => api.get<SkillOption[]>(`/services/${serviceSlug}/skills`),
    enabled: Boolean(serviceSlug),
    staleTime: 60 * 60_000,
  });
}

/** The caller's bookings, newest first. */
export function useBookings() {
  return useQuery({
    queryKey: queryKeys.bookings.list(),
    queryFn: () => bookingApi.list({ limit: 50 }),
    // Bookings change while matching runs and on site, so a short refetch keeps
    // the customer's view honest even if a realtime event is missed.
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** One of the caller's bookings. */
export function useBooking(jobId: string) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(jobId),
    queryFn: () => bookingApi.get(jobId),
    enabled: Boolean(jobId),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** Places a job request (the final step of the booking flow). */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJobRequest) => bookingApi.create(input),
    onSuccess: (job) => {
      // Seed the detail so the booking screen the flow lands on renders the
      // real job immediately instead of flashing a loading state.
      queryClient.setQueryData(queryKeys.bookings.detail(job.id), job);

      // Optimistically insert the created job into the bookings list so the
      // active-job hint can render immediately without waiting for a refetch.
      queryClient.setQueryData<JobDetail[]>(queryKeys.bookings.list(), (previous) => {
        if (!previous) return [job];
        if (previous.some((existing) => existing.id === job.id)) {
          return previous.map((existing) => (existing.id === job.id ? job : existing));
        }
        return [job, ...previous];
      });

      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/**
 * Places one checkout that may span several services.
 *
 * The server creates one independent booking per service and returns them all
 * with their shared `orderGroupId`. Every created job is seeded into the cache
 * so the requests-sent summary and the bookings list render immediately.
 */
export function useCreateBookingBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJobBatchRequest) => bookingApi.createBatch(input),
    onSuccess: (result: JobBatchResult) => {
      for (const job of result.jobs) {
        queryClient.setQueryData(queryKeys.bookings.detail(job.id), job);
      }

      queryClient.setQueryData<JobDetail[]>(queryKeys.bookings.list(), (previous) => {
        const created = result.jobs.filter(
          (job) => !previous?.some((existing) => existing.id === job.id),
        );
        return [...created, ...(previous ?? [])];
      });

      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Cancels a booking that is still cancellable. */
export function useCancelBooking(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => bookingApi.cancel(jobId),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.bookings.detail(jobId), job);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

export type { JobDetail };
