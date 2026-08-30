import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceRequestStatus } from '@samona/types';
import type { CreateServiceRequestInput, SelectProInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { paymentsApi } from '@/services/payments';
import { requestsApi } from '@/services/requests';

/** The caller's request history, newest first. */
export function useRequests(status?: ServiceRequestStatus) {
  return useQuery({
    queryKey: queryKeys.bookings.list(status),
    queryFn: () => requestsApi.list({ status }),
    // Requests change while matching runs — offers land, pros shortlist —
    // so a short refetch keeps the customer's view honest even if a realtime
    // event is missed.
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** One request, including the live shortlist of responding pros. */
export function useRequest(requestId: string) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(requestId),
    queryFn: () => requestsApi.get(requestId),
    enabled: requestId.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** Files a new request; the caller navigates to the resulting booking. */
export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceRequestInput) => requestsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Picks one professional from the request's shortlist. */
export function useSelectPro(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SelectProInput) => requestsApi.selectPro(requestId, input),
    onSuccess: (request) => {
      void queryClient.setQueryData(queryKeys.bookings.detail(requestId), request);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Cancels a request that is still cancellable. */
export function useCancelRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestsApi.cancel(requestId),
    onSuccess: (request) => {
      void queryClient.setQueryData(queryKeys.bookings.detail(requestId), request);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}

/** Settles a completed request; the amount is anchored server-side. */
export function useMarkPaid(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => paymentsApi.markPaid(requestId),
    onSuccess: (request) => {
      void queryClient.setQueryData(queryKeys.bookings.detail(requestId), request);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });
}