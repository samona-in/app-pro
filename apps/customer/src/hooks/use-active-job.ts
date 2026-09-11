import { useMemo } from 'react';
import type { JobDetail } from '@samona/types';
import { isActiveOrder } from '@/components/booking/active-job-copy';
import { useBookings } from './use-bookings';

/**
 * The caller's active orders, newest first (request → settlement).
 *
 * Rides the shared bookings query — 15s refetch plus realtime `job:status`
 * invalidation (`useRealtimeSync`) — so the hint copy stays honest even if a
 * socket event is missed.
 */
export function useActiveOrders(): JobDetail[] {
  const { data: bookings } = useBookings();

  return useMemo(
    () =>
      (bookings ?? [])
        .filter((job) => isActiveOrder(job.status))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [bookings],
  );
}

/** The caller's newest active order, or `null` when none is live. */
export function useActiveJob(): JobDetail | null {
  return useActiveOrders()[0] ?? null;
}