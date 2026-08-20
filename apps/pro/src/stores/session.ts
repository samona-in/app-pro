import { create } from 'zustand';
import type { PublicUser } from '@samona/types';

/**
 * Authentication/session state.
 *
 * Holds only what the app needs synchronously to decide which navigation stack
 * to render. Server data (profile details, jobs, earnings) belongs to TanStack
 * Query, not here (CLAUDE.md "React Native Architecture").
 */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  status: SessionStatus;
  user: PublicUser | null;
  setSession: (user: PublicUser) => void;
  clearSession: () => void;
  setStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  user: null,
  setSession: (user) => set({ user, status: 'authenticated' }),
  clearSession: () => set({ user: null, status: 'unauthenticated' }),
  setStatus: (status) => set({ status }),
}));
