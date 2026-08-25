import { create } from 'zustand';

/**
 * Client-only application state for the customer app.
 */
interface AppState {
  /** Customer's current location, updated as they move. */
  latitude: number | null;
  longitude: number | null;
  hasNetwork: boolean;
  setCoordinates: (lat: number, lng: number) => void;
  setHasNetwork: (hasNetwork: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  latitude: null,
  longitude: null,
  hasNetwork: true,
  setCoordinates: (latitude, longitude) => set({ latitude, longitude }),
  setHasNetwork: (hasNetwork) => set({ hasNetwork }),
}));
