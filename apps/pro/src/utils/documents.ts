import type { TFunction } from 'i18next';
import { isApiError } from '@samona/api-client';
import type { DocumentStatus, DocumentType } from '@samona/types';
import { DOCUMENT_CONTENT_TYPES } from '@samona/validation';
import type { BadgeTone } from '@/components/ui';
import type { TranslationKey } from '@/i18n';

/** Mirrors the server's per-file cap; used for the pre-flight size check. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** What the picker offers and what the server's allowlist accepts. */
export const DOCUMENT_PICKER_TYPES: string[] = [...DOCUMENT_CONTENT_TYPES];

/**
 * How one document row presents itself.
 *
 * Derived purely from the review status so the mapping is testable without
 * rendering. `canDelete` mirrors the server rule: approved rows are locked
 * (they are what the Verified badge is built on), everything else goes.
 * `canViewRejectionReason` only lights the reason affordance on a rejected
 * document — the reason is held off the row so every row stays one compact
 * line regardless of verdict length.
 */
export interface DocumentRowModel {
  badgeLabelKey: TranslationKey;
  badgeTone: BadgeTone;
  canDelete: boolean;
  canViewRejectionReason: boolean;
}

const BY_STATUS: Record<DocumentStatus, DocumentRowModel> = {
  PENDING: {
    badgeLabelKey: 'documents.status.PENDING',
    badgeTone: 'warning',
    canDelete: true,
    canViewRejectionReason: false,
  },
  APPROVED: {
    badgeLabelKey: 'documents.status.APPROVED',
    badgeTone: 'success',
    canDelete: false,
    canViewRejectionReason: false,
  },
  REJECTED: {
    badgeLabelKey: 'documents.status.REJECTED',
    badgeTone: 'danger',
    canDelete: true,
    canViewRejectionReason: true,
  },
};

export function documentRowModel(status: DocumentStatus): DocumentRowModel {
  return BY_STATUS[status];
}

const TYPE_LABEL_KEYS: Record<DocumentType, TranslationKey> = {
  ID_PROOF: 'documents.types.ID_PROOF',
  ADDRESS_PROOF: 'documents.types.ADDRESS_PROOF',
  PAYOUT_PROOF: 'documents.types.PAYOUT_PROOF',
  TRADE_LICENCE: 'documents.types.TRADE_LICENCE',
  CERTIFICATE: 'documents.types.CERTIFICATE',
};

/** The human label for one upload type, e.g. ID_PROOF → "ID proof". */
export function documentTypeLabelKey(type: DocumentType): TranslationKey {
  return TYPE_LABEL_KEYS[type];
}

/**
 * Maps a failed document action to a message the pro can act on: the server's
 * own human-readable message wins for anything it actually rejected (bad path,
 * missing object, locked row, rate limit), and anything else — offline,
 * timeout, 5xx — falls back to a hint.
 */
export function messageForDocumentError(error: unknown, t: TFunction): string {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  if (isApiError(error) && error.status === 0) {
    return t('documents.errors.network');
  }
  return t('documents.errors.generic');
}
