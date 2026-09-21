import type { TFunction } from 'i18next';
import { isApiError } from '@samona/api-client';

/**
 * Maps a failed job claim to a message the pro can read and act on.
 *
 * Every surface that accepts an open job — the incoming-jobs offer cards and
 * the Job Pool — shares this mapping so a lost race is explained the same way
 * everywhere. Connection failures fall back to a generic retry hint.
 */
export function messageForAcceptError(error: unknown, t: TFunction): string {
  if (isApiError(error)) {
    if (error.status === 409) return t('errors.acceptConflict');
    if (error.status === 404) return t('errors.acceptUnavailable');
    if (error.status === 429) return t('errors.acceptThrottled');
  }
  return t('errors.acceptNetwork');
}