import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { subscribe } from '@/services/realtime';

/**
 * Bridges realtime events to the query cache (customer surface).
 *
 * An event never replaces a fetch: it invalidates the queries that REST — the
 * source of truth — repopulates. Mount this once where the signed-in app
 * lives, so every screen sharing the cache updates together (CLAUDE.md
 * "Realtime").
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateBookings = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    };

    const unsubscribes = [
      subscribe('request:status', invalidateBookings),
      subscribe('request:shortlist-updated', invalidateBookings),
      subscribe('request:payment-status', invalidateBookings),
    ];

    return () => {
      for (const off of unsubscribes) off();
    };
  }, [queryClient]);
}