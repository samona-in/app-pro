import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@samona/types';
import { queryKeys } from '@/constants';
import { useAuth } from '@/providers';
import { api } from '@/services/api';

/**
 * The current session: Supabase for authentication state, the API for the
 * SAMONA user behind it.
 *
 * The server record is the authority on `role` and profile data — a Supabase
 * token proves identity only. It is fetched through TanStack Query rather than
 * mirrored into Zustand, because it is server state (CLAUDE.md "React Native
 * Architecture").
 */
export function useSession() {
  const { isLoaded, isSignedIn, signOut } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.get<PublicUser>('/auth/me'),
    // Only ask the API once Supabase actually has a session.
    enabled: isLoaded && isSignedIn,
    staleTime: 5 * 60_000,
  });

  return {
    isLoading: !isLoaded || (isSignedIn && query.isPending),
    isAuthenticated: isLoaded && isSignedIn,
    /** The SAMONA user. Undefined while loading or signed out. */
    user: query.data,
    error: query.error,
    refetch: query.refetch,
    signOut,
  };
}
