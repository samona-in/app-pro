import { z } from 'zod';
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
export declare const DOCUMENT_CONTENT_TYPES: readonly ["application/pdf", "image/jpeg", "image/png"];
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];
/** The display name the Pro gave the file. Never the storage key. */
export declare const documentFileNameSchema: z.ZodString;
/**
 * A storage path the API minted in step 1 of the upload handshake.
 *
 * The shape is checked here so a foreign path never reaches the storage
 * layer; the ownership check — the path must sit under the caller's own user
 * id — is the server's, because the schema cannot know who is calling.
 */
export declare const documentPathSchema: z.ZodString;
/**
 * Step 1 of the upload handshake — mint a presigned PUT URL.
 *
 * The declared content type is signed into the URL, so S3 rejects an upload
 * whose header disagrees with it; the path itself is derived server-side
 * from the caller's verified user id, never from this body.
 */
export declare const documentUploadStartSchema: z.ZodObject<{
    type: z.ZodEnum<{
        ID_PROOF: "ID_PROOF";
        ADDRESS_PROOF: "ADDRESS_PROOF";
        PAYOUT_PROOF: "PAYOUT_PROOF";
        TRADE_LICENCE: "TRADE_LICENCE";
        CERTIFICATE: "CERTIFICATE";
        OTHER: "OTHER";
    }>;
    fileName: z.ZodString;
    contentType: z.ZodEnum<{
        "application/pdf": "application/pdf";
        "image/jpeg": "image/jpeg";
        "image/png": "image/png";
    }>;
}, z.core.$strict>;
/**
 * Step 3 of the handshake — confirm the object landed and record it.
 *
 * Size and content type are read from the object itself, not trusted from
 * the client: this body only says *which* object to look at.
 */
export declare const documentCompleteSchema: z.ZodObject<{
    type: z.ZodEnum<{
        ID_PROOF: "ID_PROOF";
        ADDRESS_PROOF: "ADDRESS_PROOF";
        PAYOUT_PROOF: "PAYOUT_PROOF";
        TRADE_LICENCE: "TRADE_LICENCE";
        CERTIFICATE: "CERTIFICATE";
        OTHER: "OTHER";
    }>;
    fileName: z.ZodString;
    path: z.ZodString;
}, z.core.$strict>;
/**
 * An admin's review of one submitted document. A rejection must carry a
 * reason the Pro can act on — the app shows it verbatim under the document.
 */
export declare const documentReviewSchema: z.ZodObject<{
    status: z.ZodEnum<{
        APPROVED: "APPROVED";
        REJECTED: "REJECTED";
    }>;
    rejectionReason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * `POST /documents/:documentId/review` and friends path params.
 *
 * A malformed id must fail validation (422) rather than reach Prisma, which
 * rejects it as a 500.
 */
export declare const documentIdParamsSchema: z.ZodObject<{
    documentId: z.ZodUUID;
}, z.core.$strip>;
export type DocumentUploadStartInput = z.infer<typeof documentUploadStartSchema>;
export type DocumentCompleteInput = z.infer<typeof documentCompleteSchema>;
export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
//# sourceMappingURL=document.d.ts.map