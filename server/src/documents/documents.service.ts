import {
  ApiErrorCode,
  DocumentStatus,
  DocumentType,
  type ProDocument,
} from '@samona/types';
import {
  DOCUMENT_CONTENT_TYPES,
  type DocumentCompleteInput,
  type DocumentReviewInput,
  type DocumentUploadStartInput,
} from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import { conflict, notFound, badRequest, createHttpError } from '../common/errors';

export interface DocumentsServiceDeps {
  prisma: PrismaClient;
  /** Presigned upload/read URLs and the HEAD verification of landed bytes. */
  storage: StorageService;
}

/** The columns every read here selects. */
const documentSelect = {
  id: true,
  type: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

type ProDocumentRow = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
};

function toDocument(row: ProDocumentRow): ProDocument {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Pro documents domain service.
 *
 * Owns the submitted-document lifecycle: the three-step upload handshake,
 * the Pro's own list, deletion before review, presigned reads, and the admin
 * verdict — including the one rule that couples documents to the profile:
 * `ProProfile.isVerified` tracks whether any ID proof is approved.
 *
 * Every Pro-facing query is scoped by the caller's verified user id; the
 * client never names a profile (CLAUDE.md "Security").
 */
export function createDocumentsService(deps: DocumentsServiceDeps) {
  /**
   * The caller's pro profile id, or 404.
   *
   * No implicit creation here, unlike `pros.ensureForUser`: the documents
   * screen is reachable only from inside the app, past onboarding, so a
   * missing profile means something is wrong rather than "first visit".
   */
  async function profileIdForUser(userId: string): Promise<string> {
    const profile = await deps.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw notFound('Your professional profile does not exist yet.');
    }
    return profile.id;
  }

  /**
   * Step 1 of the upload handshake — a presigned PUT for a unique path under
   * the caller's own folder.
   *
   * The profile check comes first so a caller without one fails before any
   * URL is minted, rather than at confirm time when the row would have no
   * profile to hang on.
   */
  async function startUpload(
    userId: string,
    input: DocumentUploadStartInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    await profileIdForUser(userId);
    return deps.storage.createDocumentUpload(userId, input.contentType);
  }

  /**
   * Step 3 of the handshake — verify the object landed, then record it.
   *
   * Everything stored comes from the object itself: size and content type are
   * read off the `HEAD`, never re-sent by the client, so a row can never
   * claim to be a 2 MB PDF when a 40 MB blob actually landed. The path must
   * sit under the caller's own id (schema shape first, then this scope
   * check), so no caller can record — or probe for — anyone else's objects.
   */
  async function completeUpload(
    userId: string,
    input: DocumentCompleteInput,
  ): Promise<ProDocument> {
    const proProfileId = await profileIdForUser(userId);

    if (!input.path.startsWith(deps.storage.documentScope(userId))) {
      throw badRequest('That document is not valid.');
    }

    const already = await deps.prisma.proDocument.findUnique({
      where: { storagePath: input.path },
      select: { id: true },
    });
    if (already) {
      throw conflict('That document was already submitted.');
    }

    const info = await deps.storage.documentObjectInfo(input.path);
    if (!info) {
      throw conflict('The document has not reached storage yet. Try again.');
    }

    // Defensive: the content type was signed at step 1 from the validated
    // allowlist, so this only fires if something other than the handshake
    // wrote the object. Nothing is recorded, and the object is dropped so a
    // refused upload cannot accumulate.
    if (!info.contentType || !isAllowedContentType(info.contentType)) {
      await deps.storage.removeDocument(input.path);
      throw createHttpError(
        422,
        ApiErrorCode.VALIDATION_FAILED,
        'That file type is not supported. Upload a PDF, JPEG or PNG.',
      );
    }

    const row = await deps.prisma.proDocument.create({
      data: {
        proProfileId,
        type: input.type,
        storagePath: input.path,
        fileName: input.fileName,
        contentType: info.contentType,
        sizeBytes: info.sizeBytes,
      },
      select: documentSelect,
    });

    return toDocument(row as ProDocumentRow);
  }

  /** The caller's documents, newest first. Grouping by type is the app's job. */
  async function list(userId: string): Promise<ProDocument[]> {
    const proProfileId = await profileIdForUser(userId);
    const rows = await deps.prisma.proDocument.findMany({
      where: { proProfileId },
      orderBy: { createdAt: 'desc' },
      select: documentSelect,
    });
    return rows.map((row) => toDocument(row as ProDocumentRow));
  }

  /**
   * Deletes one of the caller's documents, before review only.
   *
   * An approved document is locked: it is what the Verified badge is built
   * on, and letting the owner delete it would silently un-verify the profile
   * behind the admin's back. Rejected and pending rows go freely — resubmit
   * is just a fresh upload. The object is removed after the row, so a failed
   * delete leaves an orphan rather than a row pointing at nothing.
   */
  async function remove(userId: string, documentId: string): Promise<void> {
    const proProfileId = await profileIdForUser(userId);

    const row = await deps.prisma.proDocument.findFirst({
      where: { id: documentId, proProfileId },
      select: { id: true, status: true, storagePath: true },
    });
    if (!row) throw notFound('That document does not exist.');
    if (row.status === DocumentStatus.APPROVED) {
      throw conflict('An approved document cannot be deleted.');
    }

    await deps.prisma.proDocument.delete({ where: { id: row.id } });
    await deps.storage.removeDocument(row.storagePath);
  }

  /**
   * A short-lived read URL for one document, for its owner or an admin.
   *
   * The only way to read a document at all: the bucket is private and no
   * public URL exists for it, so identity and bank details never sit behind a
   * stable link.
   */
  async function contentUrl(
    userId: string,
    documentId: string,
    isAdmin: boolean,
  ): Promise<{ url: string }> {
    const row = await deps.prisma.proDocument.findFirst({
      where: isAdmin ? { id: documentId } : { id: documentId, proProfile: { userId } },
      select: { storagePath: true },
    });
    if (!row) throw notFound('That document does not exist.');

    return { url: await deps.storage.documentContentUrl(row.storagePath) };
  }

  /**
   * Returns an admin's verdict on one document.
   *
   * The only writer of `status` and `rejectionReason` in the codebase — the
   * Pro app can submit and delete, never judge.
   *
   * When the document is an ID proof, `ProProfile.isVerified` is recomputed
   * in the same transaction rather than toggled: approved count > 0. Rejecting
   * one ID while another approved one remains therefore keeps the badge, and
   * rejecting the last one clears it — the badge always reflects the current
   * evidence, never the most recent event.
   */
  async function review(documentId: string, input: DocumentReviewInput): Promise<ProDocument> {
    const existing = await deps.prisma.proDocument.findUnique({
      where: { id: documentId },
      select: { id: true, type: true, proProfileId: true },
    });
    if (!existing) throw notFound('That document does not exist.');

    const updated = await deps.prisma.$transaction(async (tx) => {
      const row = await tx.proDocument.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          rejectionReason: input.status === 'REJECTED' ? (input.rejectionReason ?? null) : null,
          reviewedAt: new Date(),
        },
        select: documentSelect,
      });

      if (existing.type === DocumentType.ID_PROOF) {
        const approvedIdProofs = await tx.proDocument.count({
          where: {
            proProfileId: existing.proProfileId,
            type: DocumentType.ID_PROOF,
            status: DocumentStatus.APPROVED,
          },
        });
        await tx.proProfile.update({
          where: { id: existing.proProfileId },
          data: { isVerified: approvedIdProofs > 0 },
        });
      }

      return row;
    });

    return toDocument(updated as ProDocumentRow);
  }

  return {
    startUpload,
    completeUpload,
    list,
    remove,
    contentUrl,
    review,
  };
}

/** Membership test against the shared allowlist, which the schema also uses. */
function isAllowedContentType(contentType: string): boolean {
  return (DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export type DocumentsService = ReturnType<typeof createDocumentsService>;
