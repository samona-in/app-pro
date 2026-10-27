import { create } from 'zustand';
import type { Coordinates } from '@/services/location';

/** One device-location snapshot shared by every incoming card. Never persisted. */
interface ProLocationState {
  coordinates: Coordinates | null;
  status: 'loading' | 'ready' | 'unavailable';
  setCoordinates: (coordinates: Coordinates) => void;
  setUnavailable: () => void;
  reset: () => void;
}

export const useProLocationStore = create<ProLocationState>((set) => ({
  coordinates: null,
  status: 'loading',
  setCoordinates: (coordinates) => set({ coordinates, status: 'ready' }),
  setUnavailable: () => set({ coordinates: null, status: 'unavailable' }),
  reset: () => set({ coordinates: null, status: 'loading' }),
}));
