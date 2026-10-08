import { ApiErrorCode, DocumentStatus, DocumentType } from '@samona/types';
import { createApiError } from '@samona/api-client';
import type { TFunction } from 'i18next';
import {
  documentRowModel,
  documentTypeLabelKey,
  messageForDocumentError,
} from '../documents';
import { formatFileSize } from '../format';

describe('documentRowModel', () => {
  it('is deletable and pending while awaiting review', () => {
    const model = documentRowModel(DocumentStatus.PENDING);
    expect(model.badgeTone).toBe('warning');
    expect(model.badgeLabelKey).toBe('documents.status.PENDING');
    expect(model.canDelete).toBe(true);
    expect(model.canViewRejectionReason).toBe(false);
  });

  it('locks an approved document — deleting it is the one server verb refused', () => {
    const model = documentRowModel(DocumentStatus.APPROVED);
    expect(model.badgeTone).toBe('success');
    expect(model.badgeLabelKey).toBe('documents.status.APPROVED');
    expect(model.canDelete).toBe(false);
    expect(model.canViewRejectionReason).toBe(false);
  });

  it('keeps a rejected document deletable and offers its reason off the row', () => {
    const model = documentRowModel(DocumentStatus.REJECTED);
    expect(model.badgeTone).toBe('danger');
    expect(model.badgeLabelKey).toBe('documents.status.REJECTED');
    expect(model.canDelete).toBe(true);
    expect(model.canViewRejectionReason).toBe(true);
  });
});

describe('documentTypeLabelKey', () => {
  it.each([
    [DocumentType.ID_PROOF, 'documents.types.ID_PROOF'],
    [DocumentType.ADDRESS_PROOF, 'documents.types.ADDRESS_PROOF'],
    [DocumentType.PAYOUT_PROOF, 'documents.types.PAYOUT_PROOF'],
    [DocumentType.TRADE_LICENCE, 'documents.types.TRADE_LICENCE'],
    [DocumentType.CERTIFICATE, 'documents.types.CERTIFICATE'],
    [DocumentType.OTHER, 'documents.types.OTHER'],
  ])('maps %s to its translation key', (type, key) => {
    expect(documentTypeLabelKey(type)).toBe(key);
  });
});

describe('messageForDocumentError', () => {
  const t = ((key: string) => key) as unknown as TFunction;

  it('surfaces the server message for anything it actually rejected', () => {
    const error = createApiError({
      code: ApiErrorCode.CONFLICT,
      message: 'An approved document cannot be deleted.',
      status: 409,
    });
    expect(messageForDocumentError(error, t)).toBe('An approved document cannot be deleted.');
  });

  it('hints at the connection when the request never reached the server', () => {
    const error = createApiError({ code: ApiErrorCode.NETWORK, message: '', status: 0 });
    expect(messageForDocumentError(error, t)).toBe('documents.errors.network');
  });

  it('frames 5xx and unknowns as something went wrong', () => {
    expect(
      messageForDocumentError(
        createApiError({
          code: ApiErrorCode.INTERNAL,
          message: 'Something blew up.',
          status: 500,
        }),
        t,
      ),
    ).toBe('documents.errors.generic');
    expect(messageForDocumentError(new Error('boom'), t)).toBe('documents.errors.generic');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes readably', () => {
    expect(formatFileSize(400)).toBe('400 B');
    expect(formatFileSize(860_000)).toBe('840 KB');
    expect(formatFileSize(2_500_000)).toBe('2.4 MB');
  });
});