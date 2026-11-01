/**
 * Central registry of TanStack Query keys for the customer app.
 */
export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  customerProfile: ['customer-profile'] as const,
  /** The caller's account-deletion state, mounted at `/users/me`. */
  accountDeletion: ['account-deletion'] as const,
  /** The service catalogue, mounted at `/services`. */
  catalogue: ['catalogue'] as const,
  services: ['services'] as const,
  serviceSkills: (serviceSlug: string) => ['services', 'skills', serviceSlug] as const,
  serviceWorkGroups: (serviceSlug: string) => ['services', 'groups', serviceSlug] as const,
  /** The curated skills promoted on the home screen. */
  popularSkills: ['services', 'popular-skills'] as const,
  bookings: {
    all: ['bookings'] as const,
    list: (filter?: string) => ['bookings', 'list', filter ?? 'all'] as const,
    detail: (requestId: string) => ['bookings', 'detail', requestId] as const,
  },
  search: {
    all: ['search'] as const,
    results: (query: string) => ['search', 'results', query] as const,
  },
  notifications: {
    /** The customer's notices, newest first. */
    list: ['notifications', 'list'] as const,
    /** The bell pill, keyed by account so two app instances stay independent. */
    unread: (userId: string) => ['notifications', 'unread', userId] as const,
  },
  messages: {
    thread: (jobId: string) => ['messages', 'thread', jobId] as const,
    /** Scoped by user so a signed-out cache is never served to another account. */
    unread: (userId: string) => ['messages', 'unread', userId] as const,
  },
  /** Address geocoding through the server proxy. */
  geocode: {
    all: ['geocode'] as const,
    search: (query: string) => ['geocode', 'search', query] as const,
    reverse: (latitude: number, longitude: number) =>
      ['geocode', 'reverse', latitude, longitude] as const,
    place: (placeId: string) => ['geocode', 'place', placeId] as const,
  },
  /** The customer's saved addresses. */
  addresses: {
    all: ['addresses'] as const,
    list: ['addresses', 'list'] as const,
  },
  /** Home screen banners. */
  banners: ['banners'] as const,
} as const;
