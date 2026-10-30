import { create } from 'zustand';
import type { Coordinates } from '@/services/location';

/** Why the shared location snapshot is unavailable; drives the map's states. */
export type ProLocationFailure = 'permission' | 'unavailable';

/** One device-location snapshot shared by every incoming card. Never persisted. */
interface ProLocationState {
  coordinates: Coordinates | null;
  status: 'loading' | 'ready' | 'unavailable';
  /** Why it is unavailable; null while a fix exists. */
  failure: ProLocationFailure | null;
  setCoordinates: (coordinates: Coordinates) => void;
  setUnavailable: (failure?: ProLocationFailure) => void;
  reset: () => void;
}

export const useProLocationStore = create<ProLocationState>((set) => ({
  coordinates: null,
  status: 'loading',
  failure: null,
  setCoordinates: (coordinates) => set({ coordinates, status: 'ready', failure: null }),
  setUnavailable: (failure = 'unavailable') =>
    set({ coordinates: null, status: 'unavailable', failure }),
  reset: () => set({ coordinates: null, status: 'loading', failure: null }),
}));
