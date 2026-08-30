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
    // A `job:new` nudge refreshes the open pool; a `job:status` refresh keeps
    // every screen that holds the same job current.
    const unsubscribes = [
      subscribe('job:new', invalidateJobs),
      subscribe('job:status', invalidateJobs),
    ];

    return () => {
      for (const off of unsubscribes) off();
    };
  }, [queryClient]);
}
