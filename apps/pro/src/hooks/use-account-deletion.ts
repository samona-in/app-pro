import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { accountDeletionApi } from '@/services/account-deletion';

/**
 * Account-deletion (server) state, held in TanStack Query like every other
 * piece of server state — never mirrored into a store.
 */
export function useDeletionStatus() {
  return useQuery({
    queryKey: queryKeys.accountDeletion,
    queryFn: () => accountDeletionApi.status(),
    staleTime: 30_000,
  });
}

/**
 * Mints the single-use authorization token (requires a fresh OTP session).
 * Success carries the token; the redeem screen receives it via route params,
 * so it is never written to disk.
 */
export function useRequestDeletionAuthorization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => accountDeletionApi.requestAuthorization(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accountDeletion });
    },
  });
}

/**
 * Redeems the token with `DELETE /users/me`. A second use of the same token —
 * a replay — is answered 410 by the server; the screen surfaces that as
 * "code already used or expired".
 */
export function useConfirmDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => accountDeletionApi.confirm(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accountDeletion });
    },
  });
}
