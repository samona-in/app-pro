import { create } from 'zustand';
import type { PlaceType, ServiceOption, SkillOption } from '@samona/types';

/**
 * A reference photo attached to a booking draft.
 *
 * The `uri` is the local preview the user picked; `path` is the server-owned
 * object path returned once the bytes have reached storage. A draft whose
 * images have no `path` is not ready to submit.
 */
export interface DraftImage {
  uri: string;
  path: string | null;
  uploading: boolean;
  failed: boolean;
}

interface BookingDraftState {
  service: ServiceOption | null;
  skill: SkillOption | null;
  /** Free-text category when the `other` sentinel skill is chosen. */
  customSkill: string;
  placeType: PlaceType | null;
  placeDescription: string;
  description: string;
  images: DraftImage[];
  basePayPaise: number;

  start: (service: ServiceOption) => void;
  setSkill: (skill: SkillOption, customSkill?: string) => void;
  setPlace: (placeType: PlaceType, placeDescription?: string) => void;
  setDescription: (description: string) => void;
  setImages: (images: DraftImage[] | ((prev: DraftImage[]) => DraftImage[])) => void;
  setBasePay: (basePayPaise: number) => void;
  reset: () => void;
}

const blank: Pick<
  BookingDraftState,
  | 'skill'
  | 'customSkill'
  | 'placeType'
  | 'placeDescription'
  | 'description'
  | 'images'
  | 'basePayPaise'
> = {
  skill: null,
  customSkill: '',
  placeType: null,
  placeDescription: '',
  description: '',
  images: [],
  basePayPaise: 0,
};

/**
 * The in-progress booking request, shared across the booking flow screens.
 *
 * Client-only state: nothing here is persisted to the server until the final
 * step submits it. Placing the request (server state) is handled by TanStack
 * Query, never duplicated here (CLAUDE.md "React Native Architecture").
 */
export const useBookingDraft = create<BookingDraftState>((set) => ({
  service: null,
  ...blank,

  start: (service) => set({ service, ...blank }),
  setSkill: (skill, customSkill = '') => set({ skill, customSkill }),
  setPlace: (placeType, placeDescription = '') => set({ placeType, placeDescription }),
  setDescription: (description) => set({ description }),
  setImages: (imagesOrUpdater) =>
    set((state) => ({
      images:
        typeof imagesOrUpdater === 'function'
          ? (imagesOrUpdater as (prev: DraftImage[]) => DraftImage[])(state.images)
          : imagesOrUpdater,
    })),
  setBasePay: (basePayPaise) => set({ basePayPaise }),
  reset: () => set({ service: null, ...blank }),
}));
