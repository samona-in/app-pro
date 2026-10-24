'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  CreditCard,
  HelpCircle,
  Bell,
  BarChart3,
  Settings,
  Shield,
  FileText,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/providers/admin-provider';
import { Suspense } from 'react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
  { icon: Activity, label: 'Live Operations', href: '/dashboard/live' },
  { icon: Calendar, label: 'Bookings', href: '/dashboard/bookings' },
  { icon: Users, label: 'Customers', href: '/dashboard/customers' },
  { icon: Briefcase, label: 'Professionals', href: '/dashboard/professionals' },
  { icon: Settings, label: 'Services & Categories', href: '/dashboard/services' },
  { icon: CreditCard, label: 'Payments & Revenue', href: '/dashboard/payments' },
  { icon: HelpCircle, label: 'Support', href: '/dashboard/support' },
  { icon: Bell, label: 'Notifications', href: '/dashboard/notifications' },
  { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics' },
  { icon: Shield, label: 'Admin Management', href: '/dashboard/admins' },
  { icon: FileText, label: 'Audit Logs', href: '/dashboard/audit-logs' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

function SidebarContent() {
  const pathname = usePathname();
  const { adminUser, signOut } = useAdmin();

  const roleLabel = adminUser ? adminUser.role.replace(/_/g, ' ').toLowerCase() : 'loading';

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold">SAMONA Admin</h1>
        <p className="mt-1 text-xs text-gray-400 capitalize">{roleLabel}</p>
      </div>
      <nav className="flex-1 px-3 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors',
                isActive
                  ? 'bg-[#054DFF] text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon size={20} />
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-800 p-3">
        <div className="px-3 pb-3">
          <p className="truncate text-sm text-white">{adminUser?.profile.fullName ?? 'Admin'}</p>
          <p className="truncate text-xs text-gray-400">{adminUser?.profile.phone ?? ''}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
        >
          <LogOut size={20} />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <Suspense
      fallback={
        <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
          <div className="p-6">
            <h1 className="text-xl font-bold">SAMONA Admin</h1>
          </div>
        </div>
      }
    >
      <SidebarContent />
    </Suspense>
  );
}
