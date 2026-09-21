import { isApiError } from '@samona/api-client';

/**
 * Maps a failed job claim to a message the pro can read and act on.
 *
 * Every surface that accepts an open job — the incoming-jobs offer cards and
 * the Job Pool — shares this mapping so a lost race is explained the same way
 * everywhere. Connection failures fall back to a generic retry hint.
 */
export function messageForAcceptError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 409) return 'Job already taken';
    if (error.status === 404) return 'This request is no longer available';
    if (error.status === 429) return "You're moving fast — try again in a moment.";
  }
  return "Couldn't accept. Check your connection.";
}
