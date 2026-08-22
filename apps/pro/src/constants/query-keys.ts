/**
 * Central registry of TanStack Query keys.
 *
 * Keeping them here prevents the drift that makes cache invalidation unreliable
 * once several features touch the same data.
 */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  proProfile: ['pro-profile'] as const,
  catalogue: ['catalogue'] as const,
  jobs: {
    all: ['jobs'] as const,
    list: (filter?: string) => ['jobs', 'list', filter ?? 'all'] as const,
    detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
  },
  earnings: {
    all: ['earnings'] as const,
    summary: (period: string) => ['earnings', 'summary', period] as const,
  },
  notifications: ['notifications'] as const,
} as const;
