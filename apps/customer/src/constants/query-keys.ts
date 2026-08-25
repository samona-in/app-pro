/**
 * Central registry of TanStack Query keys for the customer app.
 */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  customerProfile: ['customer-profile'] as const,
  catalogue: ['catalogue'] as const,
  bookings: {
    all: ['bookings'] as const,
    list: (filter?: string) => ['bookings', 'list', filter ?? 'all'] as const,
    detail: (jobId: string) => ['bookings', 'detail', jobId] as const,
  },
  search: {
    all: ['search'] as const,
    results: (query: string) => ['search', 'results', query] as const,
  },
  notifications: ['notifications'] as const,
} as const;
