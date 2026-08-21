import { create } from 'zustand';

/**
 * Client-only application state — UI and device concerns that no server owns.
 *
 * `isOnline` here is the *optimistic local* availability toggle. The
 * authoritative availability value lives on the server and is read through
 * TanStack Query; this exists so the toggle can respond instantly while the
 * mutation is in flight.
 */
interface AppState {
  isOnline: boolean;
  /** Set by the connectivity listener, not by feature code. */
  hasNetwork: boolean;
  setOnline: (isOnline: boolean) => void;
  setHasNetwork: (hasNetwork: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: false,
  hasNetwork: true,
  setOnline: (isOnline) => set({ isOnline }),
  setHasNetwork: (hasNetwork) => set({ hasNetwork }),
}));
