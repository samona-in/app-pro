import { useCallback, useMemo } from 'react';
import { useDocuments } from './use-documents';
import { useProProfile } from './use-onboarding';
import { computeProfileCompletion } from '@/utils/profile-completion';

/**
 * Server-backed profile completion for the Home widget.
 *
 * Both queries already exist and are cached by TanStack Query: the profile
 * carries the onboarding data, service verdicts and `isVerified` flag, while
 * the documents list carries each upload's review status. Home already reads
 * the profile through the same cache key, so only the documents list is a new
 * subscription — and it is shared with the Documents screen rather than
 * fetched again.
 *
 * The derived object is memoised on the two server payloads, so a re-render
 * (focus, online status, an offer arriving) never recomputes or causes a
 * duplicate fetch.
 */
export function useProfileCompletion() {
  const profileQuery = useProProfile();
  const documentsQuery = useDocuments();

  const profileRefetch = profileQuery.refetch;
  const documentsRefetch = documentsQuery.refetch;

  const completion = useMemo(
    () => computeProfileCompletion(profileQuery.data, documentsQuery.data?.data),
    [profileQuery.data, documentsQuery.data],
  );

  const refetch = useCallback(async () => {
    await Promise.all([profileRefetch(), documentsRefetch()]);
  }, [profileRefetch, documentsRefetch]);

  return {
    ...completion,
    /** The server's verdict; the strongest signal that the widget can go away. */
    isVerified: profileQuery.data?.isVerified === true,
    /** No server data yet — render a placeholder rather than 0%. */
    isPending: profileQuery.isPending || documentsQuery.isPending,
    /** Either payload failed; progress cannot be trusted until a retry. */
    isError: profileQuery.isError || documentsQuery.isError,
    refetch,
  };
}
