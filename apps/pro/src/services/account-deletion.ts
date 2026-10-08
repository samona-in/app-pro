import type { DeletionAccepted, DeletionAuthorization, DeletionStatus } from '@samona/types';
import { api } from './api';

/**
 * Typed account-deletion requests for the pro surface, mounted at `/users/me`.
 *
 * The flow is: read what deletion would remove (`status`), prove a fresh OTP
 * to mint a single-use authorization, then redeem it with the `X-Deletion-Token`
 * header. The raw token is shown exactly once and never stored locally — the
 * server keeps only its SHA-256 (CLAUDE.md "Security").
 */
export const accountDeletionApi = {
  /** What deleting would remove and whether it can start right now. */
  status: () => api.get<DeletionStatus>('/users/me/deletion-status'),

  /**
   * Mints a single-use authorization. The server answers 403 when the current
   * session has no fresh OTP in its `amr` claim — the caller must re-verify the
   * phone (a new OTP session) and retry.
   */
  requestAuthorization: () => api.post<DeletionAuthorization>('/users/me/deletion-authorization'),

  /** Redeems the one-time token; consumes it, so a replay answers 410. */
  confirm: (token: string) =>
    api.delete<DeletionAccepted>('/users/me', {
      headers: { 'X-Deletion-Token': token },
    }),
};
