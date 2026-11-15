import type { AadhaarImage } from './aadhaar-image';
import { AADHAAR_SIDES, type AadhaarSide } from './aadhaar-flow';

/** Both sides, already processed and ready to send. */
export type AadhaarImages = Record<AadhaarSide, AadhaarImage>;

/** Document ids already recorded for this attempt, keyed by side. */
export type AadhaarUploaded = Partial<Record<AadhaarSide, string>>;

export interface UploadAadhaarSidesOptions {
  images: AadhaarImages;
  /** Sides that already completed, so a retry never uploads them twice. */
  uploaded: AadhaarUploaded;
  /** Performs the real three-step upload for one side. */
  uploadSide: (side: AadhaarSide, image: AadhaarImage) => Promise<{ id: string }>;
  /** Fires as soon as each side lands, so partial progress survives a failure. */
  onUploaded?: (side: AadhaarSide, documentId: string) => void;
}

/**
 * Uploads both Aadhaar sides without ever duplicating one.
 *
 * A failure on the back does not discard the front: the caller sees the thrown
 * error, but `onUploaded` has already recorded the front's document id. A retry
 * passes that record back in and only the missing side is sent. This is the
 * client-side half of safe partial failure — the server treats each side as an
 * independent document row.
 */
export async function uploadAadhaarSides({
  images,
  uploaded,
  uploadSide,
  onUploaded,
}: UploadAadhaarSidesOptions): Promise<Record<AadhaarSide, string>> {
  const result: AadhaarUploaded = { ...uploaded };

  for (const side of AADHAAR_SIDES) {
    if (result[side]) continue;

    const document = await uploadSide(side, images[side]);
    if (!document.id) {
      throw new Error('The upload did not return a document id.');
    }

    result[side] = document.id;
    onUploaded?.(side, document.id);
  }

  return result as Record<AadhaarSide, string>;
}
