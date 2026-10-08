import { DocumentStatus, DocumentType } from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { createDocumentsService } from './documents.service';

const USER = 'user-1';
const OTHER_USER = 'user-2';
const PROFILE_ID = 'pro-1';
const DOC_PATH = `pros/${USER}/documents/2026-10-08-id.jpg`;

/** A storage fake that answers the HEAD the way a landed object does. */
function buildStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    documentScope: (userId: string) => `pros/${userId}/documents/`,
    createDocumentUpload: jest.fn().mockResolvedValue({
      path: DOC_PATH,
      uploadUrl: 'https://signed.test/put',
    }),
    documentObjectInfo: jest.fn().mockResolvedValue({ sizeBytes: 2048, contentType: 'image/jpeg' }),
    documentContentUrl: jest.fn().mockResolvedValue('https://signed.test/get'),
    removeDocument: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StorageService;
}

// The transaction view of prisma, kept separate so `$transaction` can hand it
// to the callback while the service's outer calls still hit the main fake.
type Tx = {
  proDocument: { update: jest.Mock; count: jest.Mock };
  proProfile: { update: jest.Mock };
};

function buildPrisma() {
  const tx: Tx = {
    proDocument: { update: jest.fn(), count: jest.fn() },
    proProfile: { update: jest.fn() },
  };
  const prisma = {
    proProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: PROFILE_ID }),
      update: jest.fn().mockResolvedValue({}),
    },
    proDocument: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: Tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

function build(overrides: { prisma?: unknown; storage?: unknown } = {}) {
  const { prisma, tx } = buildPrisma();
  const deps = {
    prisma: (overrides.prisma ?? prisma) as PrismaClient,
    storage: (overrides.storage ?? buildStorage()) as StorageService,
  };
  return { service: createDocumentsService(deps), prisma, tx };
}

/** A row the prisma fake resolves `create`/`update` with. */
const ROW = {
  id: 'doc-1',
  type: DocumentType.ID_PROOF,
  status: DocumentStatus.PENDING,
  rejectionReason: null,
  reviewedAt: null,
  fileName: 'aadhaar.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 2048,
  createdAt: new Date('2026-10-08T08:00:00Z'),
};

describe('documents service', () => {
  describe('completeUpload', () => {
    it('records a row from the object HEAD, never the caller, once a scope-checked path lands', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.create as jest.Mock).mockResolvedValue(ROW);

      const doc = await service.completeUpload(USER, {
        type: DocumentType.ID_PROOF,
        path: DOC_PATH,
        fileName: 'aadhaar.jpg',
      });

      expect(doc).toMatchObject({
        id: 'doc-1',
        fileName: 'aadhaar.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        createdAt: '2026-10-08T08:00:00.000Z',
      });
      expect(prisma.proDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proProfileId: PROFILE_ID,
            storagePath: DOC_PATH,
            sizeBytes: 2048,
          }),
        }),
      );
    });

    it('refuses a path minted under another user', async () => {
      const { service, prisma } = build();
      await expect(
        service.completeUpload(USER, {
          type: DocumentType.ID_PROOF,
          path: `pros/${OTHER_USER}/documents/other.jpg`,
          fileName: 'x.jpg',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.proDocument.create).not.toHaveBeenCalled();
    });

    it('refuses a replay of the same path once it is recorded', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.findUnique as jest.Mock).mockResolvedValue({ id: 'doc-1' });

      await expect(
        service.completeUpload(USER, {
          type: DocumentType.ID_PROOF,
          path: DOC_PATH,
          fileName: 'aadhaar.jpg',
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.proDocument.create).not.toHaveBeenCalled();
    });

    it('refuses a confirm whose object never reached storage', async () => {
      const storage = buildStorage({ documentObjectInfo: jest.fn().mockResolvedValue(null) });
      const { service, prisma } = build({ storage });

      await expect(
        service.completeUpload(USER, {
          type: DocumentType.ID_PROOF,
          path: DOC_PATH,
          fileName: 'aadhaar.jpg',
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.proDocument.create).not.toHaveBeenCalled();
    });

    it('drops and refuses an object whose real content type is outside the allowlist', async () => {
      const storage = buildStorage({
        documentObjectInfo: jest
          .fn()
          .mockResolvedValue({ sizeBytes: 2048, contentType: 'text/html' }),
      });
      const { service, prisma } = build({ storage });

      await expect(
        service.completeUpload(USER, {
          type: DocumentType.ID_PROOF,
          path: DOC_PATH,
          fileName: 'aadhaar.jpg',
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(storage.removeDocument).toHaveBeenCalledWith(DOC_PATH);
      expect(prisma.proDocument.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('404s for a document that is not the callers own', async () => {
      const { service, prisma } = build();
      await expect(service.remove(USER, 'doc-1')).rejects.toMatchObject({ status: 404 });
      expect(prisma.proDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'doc-1', proProfileId: PROFILE_ID } }),
      );
      expect(prisma.proDocument.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete an approved document', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.findFirst as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.APPROVED,
        storagePath: DOC_PATH,
      });

      await expect(service.remove(USER, 'doc-1')).rejects.toMatchObject({ status: 409 });
      expect(prisma.proDocument.delete).not.toHaveBeenCalled();
    });

    it('deletes the row, then the object, for a pending or rejected document', async () => {
      const storage = buildStorage();
      const { service, prisma } = build({ storage });
      (prisma.proDocument.findFirst as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.REJECTED,
        storagePath: DOC_PATH,
      });

      await service.remove(USER, 'doc-1');

      expect(prisma.proDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
      expect(storage.removeDocument).toHaveBeenCalledWith(DOC_PATH);
    });
  });

  describe('review — the one coupling', () => {
    const reviewable = { id: 'doc-1', type: DocumentType.ID_PROOF, proProfileId: PROFILE_ID };

    it('approving an ID proof verifies the profile', async () => {
      const { service, prisma, tx } = build();
      (prisma.proDocument.findUnique as jest.Mock).mockResolvedValue(reviewable);
      (tx.proDocument.update as jest.Mock).mockResolvedValue({
        ...ROW,
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
      });
      (tx.proDocument.count as jest.Mock).mockResolvedValue(1);

      const updated = await service.review('doc-1', { status: 'APPROVED' });

      expect(updated.status).toBe(DocumentStatus.APPROVED);
      expect(tx.proDocument.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: DocumentStatus.APPROVED }),
        }),
      );
      expect(tx.proProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isVerified: true } }),
      );
    });

    it('rejecting the only approved ID proof clears the badge', async () => {
      const { service, prisma, tx } = build();
      (prisma.proDocument.findUnique as jest.Mock).mockResolvedValue(reviewable);
      (tx.proDocument.update as jest.Mock).mockResolvedValue({
        ...ROW,
        status: DocumentStatus.REJECTED,
        rejectionReason: 'Not legible.',
        reviewedAt: new Date(),
      });
      (tx.proDocument.count as jest.Mock).mockResolvedValue(0);

      const updated = await service.review('doc-1', {
        status: 'REJECTED',
        rejectionReason: 'Not legible.',
      });

      expect(updated.status).toBe(DocumentStatus.REJECTED);
      expect(updated.rejectionReason).toBe('Not legible.');
      expect(tx.proProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isVerified: false } }),
      );
    });

    it('leaves the badge alone when the reviewed document is not an ID proof', async () => {
      const { service, prisma, tx } = build();
      (prisma.proDocument.findUnique as jest.Mock).mockResolvedValue({
        ...reviewable,
        type: DocumentType.TRADE_LICENCE,
      });
      (tx.proDocument.update as jest.Mock).mockResolvedValue({
        ...ROW,
        type: DocumentType.TRADE_LICENCE,
        status: DocumentStatus.APPROVED,
        reviewedAt: new Date(),
      });

      await service.review('doc-1', { status: 'APPROVED' });

      expect(tx.proDocument.count).not.toHaveBeenCalled();
      expect(tx.proProfile.update).not.toHaveBeenCalled();
    });
  });

  describe('contentUrl', () => {
    it('resolves a read URL only under the owners profile', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.findFirst as jest.Mock).mockResolvedValue({ storagePath: DOC_PATH });

      const { url } = await service.contentUrl(USER, 'doc-1', false);

      expect(url).toBe('https://signed.test/get');
      expect(prisma.proDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'doc-1', proProfile: { userId: USER } } }),
      );
    });

    it('lets an admin read anything by id', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.findFirst as jest.Mock).mockResolvedValue({ storagePath: DOC_PATH });

      await service.contentUrl(USER, 'doc-1', true);

      expect(prisma.proDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'doc-1' } }),
      );
    });

    it('404s when nothing matches', async () => {
      const { service, prisma } = build();
      (prisma.proDocument.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.contentUrl(OTHER_USER, 'doc-1', false)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});