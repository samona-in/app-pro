'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS_ADMIN' | 'FINANCE_ADMIN' | 'SUPPORT_ADMIN';

export interface AdminProfile {
  id: string;
  phone: string | null;
  fullName: string | null;
  email: string | null;
}

export interface AdminUser {
  id: string;
  role: AdminRole;
  permissions: string[] | null;
  profile: AdminProfile;
}

interface AdminContextValue {
  /** Null until `/admin/auth/me` confirms the session. */
  adminUser: AdminUser | null;
  status: 'loading' | 'ready' | 'error';
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AdminContext = createContext<AdminContextValue | null>(null);

/**
 * Loads the signed-in admin and guards the dashboard.
 *
 * The session is an HttpOnly cookie the browser cannot inspect, so the only way
 * to know whether it is still valid is to ask the API. A 401 sends the user to
 * the login page; anything else is treated as a hard failure.
 *
 * `children` is always rendered — even while loading — because a layout that
 * conditionally omits its children makes Next.js drop the segment from instant
 * navigation validation. The loading/error state is an overlay instead.
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await api.get('/admin/auth/me');
        if (cancelled) return;
        setAdminUser(response.data.adminUser as AdminUser);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        const statusCode = (error as { response?: { status?: number } })?.response?.status;
        if (statusCode === 401 || statusCode === 403) {
          router.replace('/login');
          return;
        }
        setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/admin/auth/logout');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }, [router]);

  const can = useCallback(
    (permission: string) => {
      if (!adminUser) return false;
      if (adminUser.role === 'SUPER_ADMIN') return true;
      return Array.isArray(adminUser.permissions) && adminUser.permissions.includes(permission);
    },
    [adminUser],
  );

  const value = useMemo<AdminContextValue>(
    () => ({ adminUser, status, signOut, can }),
    [adminUser, status, signOut, can],
  );

  return (
    <AdminContext.Provider value={value}>
      {children}
      {status === 'loading' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
          <div className="text-sm text-gray-500">Checking your session…</div>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-lg font-semibold text-gray-900">Could not load your session</h1>
            <p className="text-sm text-gray-600">
              The admin API is unreachable. Check that the server is running and try again.
            </p>
            <button
              type="button"
              className="rounded-md bg-[#054DFF] px-4 py-2 text-sm font-medium text-white hover:bg-[#054DFF]/90"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used inside AdminProvider.');
  }
  return context;
}
