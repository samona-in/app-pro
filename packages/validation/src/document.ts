import { z } from 'zod';
import { DOCUMENT_TYPES, type DocumentType } from '@samona/types';
import { idSchema } from './primitives';

/** Every valid document type, as a tuple zod's enum accepts. */
const documentTypeOptions = DOCUMENT_TYPES as [DocumentType, ...DocumentType[]];

/**
 * Content types the API accepts for a document upload.
 *
 * PDF and the two raster formats cover what a Pro actually holds: scans,
 * photos of paper, exported certificates. SVG and HTML are deliberately
 * excluded — both can carry scripts, and a document is opened through a
 * presigned URL in a browser. One list, used by the upload schema here and
 * again by the server when it verifies the object that actually landed in
 * the bucket, so the two checks cannot drift apart.
 */
export const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

/** The display name the Pro gave the file. Never the storage key. */
export const documentFileNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the file a name.')
  .max(200, 'Keep the file name under 200 characters.')
  // Control characters would corrupt the list UI and the log lines it lands in.
  // A char-code scan instead of a regex: `no-control-regex` forbids the literal
  // escapes, and a scan is just as cheap for a ≤200-char string.
  .refine(
    (value) =>
      [...value].every((char) => {
        const code = char.charCodeAt(0);
        return code >= 32 && code !== 127;
      }),
    'That file name is not valid.',
  );

/**
 * A storage path the API minted in step 1 of the upload handshake.
 *
 * The shape is checked here so a foreign path never reaches the storage
 * layer; the ownership check — the path must sit under the caller's own user
 * id — is the server's, because the schema cannot know who is calling.
 */
export const documentPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(
    /^pros\/[^/]+\/documents\/[^/]+\.(pdf|jpe?g|png)$/i,
    'The document path is not valid.',
  );

/**
 * Step 1 of the upload handshake — mint a presigned PUT URL.
 *
 * The declared content type is signed into the URL, so S3 rejects an upload
 * whose header disagrees with it; the path itself is derived server-side
 * from the caller's verified user id, never from this body.
 */
export const documentUploadStartSchema = z.strictObject({
  type: z.enum(documentTypeOptions),
  fileName: documentFileNameSchema,
  contentType: z.enum(DOCUMENT_CONTENT_TYPES, {
    message: 'That file type is not supported. Upload a PDF, JPEG or PNG.',
  }),
});

/**
 * Step 3 of the handshake — confirm the object landed and record it.
 *
 * Size and content type are read from the object itself, not trusted from
 * the client: this body only says *which* object to look at.
 */
export const documentCompleteSchema = z.strictObject({
  type: z.enum(documentTypeOptions),
  fileName: documentFileNameSchema,
  path: documentPathSchema,
});

/** The verdicts an admin may return. `PENDING` is not a review outcome. */
const documentVerdictOptions = ['APPROVED', 'REJECTED'] as const;

/**
 * An admin's review of one submitted document. A rejection must carry a
 * reason the Pro can act on — the app shows it verbatim under the document.
 */
export const documentReviewSchema = z
  .object({
    status: z.enum(documentVerdictOptions),
    rejectionReason: z
      .string()
      .trim()
      .min(5, 'Give a reason the Pro can act on.')
      .max(500, 'Keep the reason under 500 characters.')
      .optional(),
  })
  .refine((value) => value.status === 'APPROVED' || value.rejectionReason !== undefined, {
    message: 'A rejection needs a reason.',
    path: ['rejectionReason'],
  });

/**
 * `POST /documents/:documentId/review` and friends path params.
 *
 * A malformed id must fail validation (422) rather than reach Prisma, which
 * rejects it as a 500.
 */
export const documentIdParamsSchema = z.object({
  documentId: idSchema,
});

export type DocumentUploadStartInput = z.infer<typeof documentUploadStartSchema>;
export type DocumentCompleteInput = z.infer<typeof documentCompleteSchema>;
export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
