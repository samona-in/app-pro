import { create } from 'zustand';
import type { ServiceOption, SkillOption } from '@samona/types';

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
  description: string;
  images: DraftImage[];
  /**
   * The customer's pricing selection. The server validates these against the
   * catalogue and recomputes the amount; `basePayPaise` is only the estimate
   * shown in the review step.
   */
  quantity: number;
  durationMinutes: number | null;
  basePayPaise: number;

  start: (service: ServiceOption) => void;
  setSkill: (skill: SkillOption, customSkill?: string) => void;
  setDescription: (description: string) => void;
  setImages: (images: DraftImage[] | ((prev: DraftImage[]) => DraftImage[])) => void;
  setPricing: (selection: {
    quantity: number;
    durationMinutes: number | null;
    totalPaise: number;
  }) => void;
  reset: () => void;
}

const blank: Pick<
  BookingDraftState,
  | 'skill'
  | 'customSkill'
  | 'description'
  | 'images'
  | 'quantity'
  | 'durationMinutes'
  | 'basePayPaise'
> = {
  skill: null,
  customSkill: '',
  description: '',
  images: [],
  quantity: 1,
  durationMinutes: null,
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
  setDescription: (description) => set({ description }),
  setImages: (imagesOrUpdater) =>
    set((state) => ({
      images:
        typeof imagesOrUpdater === 'function'
          ? (imagesOrUpdater as (prev: DraftImage[]) => DraftImage[])(state.images)
          : imagesOrUpdater,
    })),
  setPricing: ({ quantity, durationMinutes, totalPaise }) =>
    set({ quantity, durationMinutes, basePayPaise: totalPaise }),
  reset: () => set({ service: null, ...blank }),
}));
