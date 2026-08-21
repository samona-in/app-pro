import { useSessionStore } from '@/stores/session';

/**
 * Read-only view of the current session.
 *
 * Screens use this to branch on auth state; they should not reach into the
 * store directly so the underlying implementation can change.
 */
export function useSession() {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);

  return {
    status,
    user,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
  };
}
