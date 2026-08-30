/**
 * Central registry of TanStack Query keys for the customer app.
 */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  customerProfile: ['customer-profile'] as const,
  /** The service catalogue, mounted at `/services`. */
  catalogue: ['catalogue'] as const,
  services: ['services'] as const,
  serviceSkills: (serviceSlug: string) => ['services', 'skills', serviceSlug] as const,
  bookings: {
    all: ['bookings'] as const,
    list: (filter?: string) => ['bookings', 'list', filter ?? 'all'] as const,
    detail: (requestId: string) => ['bookings', 'detail', requestId] as const,
  },
  search: {
    all: ['search'] as const,
    results: (query: string) => ['search', 'results', query] as const,
  },
  notifications: ['notifications'] as const,
} as const;
