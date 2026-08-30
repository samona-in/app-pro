import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { subscribe } from '@/services/realtime';

/**
 * Bridges realtime events to the query cache.
 *
 * An event never replaces a fetch: it invalidates the queries that REST — the
 * source of truth — repopulates. Mount this once where the signed-in app
 * lives, so every screen sharing the cache updates together (CLAUDE.md
 * "Realtime").
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateJobs = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    };
    const invalidateMarketplace = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.available });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.offers() });
    };

    const unsubscribes = [
      subscribe('job:offer', invalidateMarketplace),
      subscribe('job:offer-status', invalidateJobs),
      subscribe('request:status', invalidateJobs),
      subscribe('request:payment-status', invalidateJobs),
    ];

    return () => {
      for (const off of unsubscribes) off();
    };
  }, [queryClient]);
}