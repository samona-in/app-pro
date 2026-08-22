import { useQuery } from '@tanstack/react-query';
import type { OnboardingStep, ProProfile, PublicUser } from '@samona/types';
import { queryKeys } from '@/constants';
import { useAuth } from '@/providers';
import { api } from '@/services/api';

/** What `GET /auth/me` returns: identity, pro profile and the routing decision. */
export interface SessionResponse {
  user: PublicUser;
  proProfile: ProProfile;
  onboardingStatus: ProProfile['onboardingStatus'];
  nextStep: OnboardingStep;
}

/**
 * The current session: Supabase for authentication state, the API for who that
 * identity is in SAMONA.
 *
 * The server record is the authority on role, profile and onboarding state — a
 * Supabase token proves identity only. It is fetched through TanStack Query
 * rather than mirrored into Zustand, because it is server state (CLAUDE.md
 * "React Native Architecture").
 */
export function useSession() {
  const { isLoaded, isSignedIn, signOut } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.get<SessionResponse>('/auth/me'),
    // Only ask the API once Supabase actually has a session.
    enabled: isLoaded && isSignedIn,
    staleTime: 60_000,
  });

  return {
    /** True until both the session and the profile behind it are known. */
    isLoading: !isLoaded || (isSignedIn && query.isPending),
    isAuthenticated: isLoaded && isSignedIn,
    user: query.data?.user,
    proProfile: query.data?.proProfile,
    onboardingStatus: query.data?.onboardingStatus,
    nextStep: query.data?.nextStep,
    isOnboardingComplete: query.data?.onboardingStatus === 'COMPLETED',
    error: query.error,
    refetch: query.refetch,
    signOut,
  };
}
