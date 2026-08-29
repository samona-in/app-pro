import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Job, SkillOption } from '@samona/types';
import type { CreateJobInput } from '@samona/validation';
import { queryKeys } from '@/constants';
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
    queryFn: () => api.get<Job[]>('/jobs', { query: { limit: 50 } }),
    staleTime: 15_000,
  });
}

/** One of the caller's bookings. */
export function useBooking(jobId: string) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(jobId),
    queryFn: () => api.get<Job>(`/jobs/${jobId}`),
    enabled: Boolean(jobId),
    staleTime: 15_000,
  });
}

/** Places a job request (the final step of the booking flow). */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJobInput) => api.post<Job>('/jobs', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}
