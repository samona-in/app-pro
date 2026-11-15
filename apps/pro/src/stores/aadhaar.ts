import { create } from 'zustand';
import type { AadhaarImage } from '@/utils/aadhaar-image';
import type { AadhaarSide } from '@/utils/aadhaar-flow';
import type { AadhaarUploaded } from '@/utils/aadhaar-upload';

/**
 * In-memory state for one Aadhaar capture attempt.
 *
 * Deliberately not persisted: the photos are sensitive, the upload must finish
 * while the Pro is on the screen, and a cold start should begin again rather
 * than resurrect old image files. Navigation params never carry a URI — the
 * source screen is passed as a non-sensitive string and everything else lives
 * here.
 */
interface AadhaarState {
  front: AadhaarImage | null;
  back: AadhaarImage | null;
  /** Document ids already accepted by the server, keyed by side. */
  uploaded: AadhaarUploaded;
  setImage: (side: AadhaarSide, image: AadhaarImage) => void;
  clearImage: (side: AadhaarSide) => void;
  markUploaded: (side: AadhaarSide, documentId: string) => void;
  /** Clears every image reference and upload id. */
  reset: () => void;
}

const INITIAL: Pick<AadhaarState, 'front' | 'back' | 'uploaded'> = {
  front: null,
  back: null,
  uploaded: {},
};

export const useAadhaarStore = create<AadhaarState>((set) => ({
  ...INITIAL,

  setImage: (side, image) =>
    set((state) => (side === 'front' ? { ...state, front: image } : { ...state, back: image })),

  clearImage: (side) =>
    set((state) => (side === 'front' ? { ...state, front: null } : { ...state, back: null })),

  markUploaded: (side, documentId) =>
    set((state) => ({ ...state, uploaded: { ...state.uploaded, [side]: documentId } })),

  reset: () => set({ ...INITIAL, uploaded: {} }),
}));
