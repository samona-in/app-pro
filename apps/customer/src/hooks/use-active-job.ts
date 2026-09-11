import { useMemo } from 'react';
import type { JobDetail } from '@samona/types';
import { isActiveOrder } from '@/components/booking/active-job-copy';
import { useBookings } from './use-bookings';

/**
 * The caller's newest order that is still live (request → settlement).
 *
 * Rides the shared bookings query — 15s refetch plus realtime `job:status`
 * invalidation (`useRealtimeSync`) — so the hint copy stays honest even if a
 * socket event is missed.
 */
export function useActiveJob(): JobDetail | null {
  const { data: bookings } = useBookings();

  return useMemo(
    () => bookings?.find((job) => isActiveOrder(job.status)) ?? null,
    [bookings],
  );
}