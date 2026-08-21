import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

/**
 * The current session: Clerk for authentication state, the API for the SAMONA
 * user behind it.
 *
 * The server record is the authority on `role` and profile data — a Clerk
 * token proves identity only. It is fetched through TanStack Query rather than
 * mirrored into Zustand, because it is server state (CLAUDE.md "React Native
 * Architecture").
 */
export function useSession() {
  const { isLoaded, isSignedIn, signOut } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.get<PublicUser>('/auth/me'),
    // Only ask the API once Clerk actually has a session.
    enabled: isLoaded && isSignedIn === true,
    staleTime: 5 * 60_000,
  });

  return {
    isLoading: !isLoaded || (isSignedIn === true && query.isPending),
    isAuthenticated: isLoaded && isSignedIn === true,
    /** The SAMONA user. Undefined while loading or signed out. */
    user: query.data,
    error: query.error,
    refetch: query.refetch,
    signOut,
  };
}
