import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobDetail, SkillOption } from '@samona/types';
import type { CreateJobInput } from '@samona/validation';
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
    mutationFn: (input: CreateJobInput) => bookingApi.create(input),
    onSuccess: (job) => {
      // Seed the detail so the booking screen the flow lands on renders the
      // real job immediately instead of flashing a loading state.
      queryClient.setQueryData(queryKeys.bookings.detail(job.id), job);
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
