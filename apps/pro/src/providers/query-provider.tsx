import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isRetryable } from '@samona/api-client';

/**
 * TanStack Query owns all server state (CLAUDE.md "React Native Architecture").
 *
 * Defaults are tuned for a mobile client on an unreliable connection: retry
 * transient failures, never retry an auth or validation error.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Only transient API failures are worth retrying. Anything else — an
          // auth error, a validation error, or a bug thrown inside the query
          // function — will fail the same way on the next attempt.
          if (!isRetryable(error)) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Mutations are not idempotent by default — let callers opt in.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState keeps one client for the lifetime of the app without a module-level
  // singleton, which would leak between tests.
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
