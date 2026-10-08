import type { ProDocument } from '@samona/types';
import type { DocumentCompleteInput, DocumentUploadStartInput } from '@samona/validation';
import { api } from './api';

/**
 * Typed document requests for the Pro surface.
 *
 * Thin functions over the shared `api` client. The server owns every verdict
 * (`status`, `rejectionReason`) and reads size and content type from the
 * object itself at confirm time — these merely state what the Pro wants.
 * The PUT of the actual bytes is deliberately absent: it goes device-to-bucket
 * through `putBytesToPresignedUrl` in `@/utils/presigned-upload`, never
 * through this API.
 */
export const documentsApi = {
  /** The caller's documents, newest first. */
  list: () => api.get<{ data: ProDocument[] }>('/documents'),

  /** Step 1 of the upload handshake: a one-time URL to stream bytes to. */
  startUpload: (body: DocumentUploadStartInput) =>
    api.post<{ path: string; uploadUrl: string }>('/documents/upload-url', body),

  /** Step 3: confirm the object landed; the server HEADs it and records the row. */
  complete: (body: DocumentCompleteInput) => api.post<ProDocument>('/documents/complete', body),

  /** Deletes one of the caller's documents. The server refuses approved rows. */
  remove: (documentId: string) => api.delete<void>(`/documents/${documentId}`),
};
