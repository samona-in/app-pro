import type { TFunction } from 'i18next';
import { isApiError } from '@samona/api-client';
import type { ProServiceStatus } from '@samona/types';
import type { BadgeTone } from '@/components/ui';
import type { TranslationKey } from '@/i18n';

/**
 * How one row of the Manage Services screen presents itself.
 *
 * Derived purely from the pro's verification status so the mapping is testable
 * without rendering: the badge says where the request stands, and the action is
 * only offered when the server would actually accept one (never for PENDING,
 * never for ACCEPTED — approval is admin-only).
 */
export interface ServiceRowModel {
  badgeLabelKey: TranslationKey;
  badgeTone: BadgeTone;
  /** Which button the row shows, or null when there is nothing to request. */
  action: 'request' | 'requestAgain' | null;
  actionLabelKey: TranslationKey | null;
  /** Rejected rows surface the admin's reason beneath the service name. */
  showRejectionReason: boolean;
}

const notRequested: ServiceRowModel = {
  badgeLabelKey: 'manageServices.status.notRequested',
  badgeTone: 'neutral',
  action: 'request',
  actionLabelKey: 'manageServices.action.request',
  showRejectionReason: false,
};

const BY_STATUS: Record<ProServiceStatus, ServiceRowModel> = {
  PENDING: {
    badgeLabelKey: 'manageServices.status.pending',
    badgeTone: 'warning',
    action: null,
    actionLabelKey: null,
    showRejectionReason: false,
  },
  ACCEPTED: {
    badgeLabelKey: 'manageServices.status.approved',
    badgeTone: 'success',
    action: null,
    actionLabelKey: null,
    showRejectionReason: false,
  },
  REJECTED: {
    badgeLabelKey: 'manageServices.status.rejected',
    badgeTone: 'danger',
    action: 'requestAgain',
    actionLabelKey: 'manageServices.action.requestAgain',
    showRejectionReason: true,
  },
};

/** `status: null` means the pro has never requested the service. */
export function serviceRowModel(status: ProServiceStatus | null): ServiceRowModel {
  return status === null ? notRequested : BY_STATUS[status];
}

/**
 * Maps a failed service request to a message the pro can act on, mirroring
 * `messageForAcceptError`: the server's own human-readable message wins, and
 * anything else (offline, timeout) falls back to a connection hint.
 */
export function messageForRequestError(error: unknown, t: TFunction): string {
  if (isApiError(error)) {
    if (error.status === 403) return t('manageServices.errors.onboarding');
    if (error.status === 404) return t('manageServices.errors.unavailable');
    if (error.status === 409) return t('manageServices.errors.conflict');
    if (error.status === 429) return t('manageServices.errors.throttled');
    if (error.status >= 400 && error.status < 500) return error.message;
  }
  return t('manageServices.errors.network');
}
