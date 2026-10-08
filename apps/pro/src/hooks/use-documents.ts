import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentType } from '@samona/types';
import type { DocumentCompleteInput, DocumentUploadStartInput } from '@samona/validation';
import { queryKeys } from '@/constants';
import { documentsApi } from '@/services/documents';
import { putBytesToPresignedUrl } from '@/utils/presigned-upload';

/** One picked file, ready for the three-step upload handshake. */
export interface DocumentUpload {
  type: DocumentType;
  localUri: string;
  fileName: string;
  contentType: string;
}

/** The caller's submitted documents, newest first. */
export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.documents,
    queryFn: () => documentsApi.list(),
    staleTime: 30_000,
  });
}

/**
 * Runs the full upload handshake: mint a ticket, stream the bytes straight to
 * the bucket, then confirm — the server records the row only after it HEADs
 * the object itself.
 *
 * The list is refetched rather than patched so the row shows whatever state
 * actually landed; the profile is not touched because submitting a document
 * never verifies anyone (only an admin's approval of an ID proof does).
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, localUri, fileName, contentType }: DocumentUpload) => {
      // `contentType` was checked against the shared allowlist on the screen
      // before the mutation ran; the cast narrows it for the input schema.
      const start: DocumentUploadStartInput = {
        type,
        fileName,
        contentType: contentType as DocumentUploadStartInput['contentType'],
      };
      const ticket = await documentsApi.startUpload(start);
      await putBytesToPresignedUrl(ticket, localUri, contentType);
      const complete: DocumentCompleteInput = { type, path: ticket.path, fileName };
      return documentsApi.complete(complete);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
}

/**
 * Deletes one of the caller's documents.
 *
 * The server refuses approved rows (409) — the row simply stays and the
 * caller's error handler explains why, so no optimistic removal.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.remove(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
}
