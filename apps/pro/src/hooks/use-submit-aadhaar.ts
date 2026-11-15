import { useCallback, useRef, useState } from 'react';
import { DocumentType } from '@samona/types';
import { useAadhaarStore } from '@/stores';
import { uploadAadhaarSides } from '@/utils/aadhaar-upload';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import type { AadhaarImage } from '@/utils/aadhaar-image';
import { useUploadDocument } from './use-documents';

/** Display names keep the two sides distinguishable in the documents list. */
const FILE_NAMES: Record<AadhaarSide, string> = {
  front: 'Aadhaar front.jpg',
  back: 'Aadhaar back.jpg',
};

/**
 * Submits both Aadhaar sides as two ordinary ID-proof documents.
 *
 * Each side runs the existing three-step upload handshake, so there is no
 * parallel document path and no new server trust: the API still HEADs the
 * landed object, records it as `PENDING`, and leaves verification to the
 * review team. A side that already uploaded is skipped on retry, which is what
 * makes a partial failure safe to resume.
 *
 * The `inFlight` ref is the duplicate guard: state alone can lag a double tap
 * by a frame, but the ref is set synchronously before the first request.
 */
export function useSubmitAadhaar() {
  const upload = useUploadDocument();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (front: AadhaarImage, back: AadhaarImage): Promise<boolean> => {
      if (inFlight.current) return false;

      inFlight.current = true;
      setIsSubmitting(true);
      setError(null);

      try {
        await uploadAadhaarSides({
          images: { front, back },
          uploaded: useAadhaarStore.getState().uploaded,
          uploadSide: async (side, image) => {
            const document = await upload.mutateAsync({
              type: DocumentType.ID_PROOF,
              localUri: image.uri,
              fileName: FILE_NAMES[side],
              contentType: 'image/jpeg',
            });
            return document;
          },
          onUploaded: (side, documentId) => {
            useAadhaarStore.getState().markUploaded(side, documentId);
          },
        });
        return true;
      } catch (cause) {
        setError(cause);
        return false;
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [upload],
  );

  return { submit, isSubmitting, error };
}
