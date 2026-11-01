import { useQuery } from '@tanstack/react-query';
import type { CustomerProfile, CustomerOnboardingStep, PublicUser } from '@samona/types';
import { queryKeys } from '@/constants';
// Imported from its module, not the `@/providers` barrel: the barrel mounts the
// live-location provider, which reaches back into these hooks.
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/services/api';

export interface SessionResponse {
  user: PublicUser;
  customerProfile: CustomerProfile;
  onboardingStatus: CustomerProfile['onboardingStatus'];
  nextStep: CustomerOnboardingStep | null;
}

export function useSession() {
  const { isLoaded, isSignedIn, signOut } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.get<SessionResponse>('/auth/me'),
    enabled: isLoaded && isSignedIn,
    staleTime: 60_000,
  });

  return {
    isLoading: !isLoaded || (isSignedIn && query.isPending),
    isAuthenticated: isLoaded && isSignedIn,
    user: query.data?.user,
    customerProfile: query.data?.customerProfile,
    onboardingStatus: query.data?.onboardingStatus,
    nextStep: query.data?.nextStep,
    isOnboardingComplete: query.data?.onboardingStatus === 'COMPLETED',
    error: query.error,
    refetch: query.refetch,
    signOut,
  };
}
