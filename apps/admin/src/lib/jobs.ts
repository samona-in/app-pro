/**
 * Shapes and display helpers for the admin bookings ledger.
 *
 * These mirror the contracts in `server/src/admin/jobs/admin-jobs.routes.ts`.
 * The admin app deliberately does not import `@samona/types` (it is a separate
 * deployment); keep the two in sync by hand when the job lifecycle changes.
 */

export const JOB_STATUSES = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'TRAVELLING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
  'PAID',
  'CANCELLED',
  'EXPIRED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Everything that has not reached a terminal state. Mirrors the customer app. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'TRAVELLING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
];

/** Settled or abandoned work. */
export const PAST_JOB_STATUSES: readonly JobStatus[] = ['PAID', 'CANCELLED', 'EXPIRED'];

const STATUS_LABELS: Record<JobStatus, string> = {
  REQUESTED: 'Requested',
  OFFERED: 'Offered',
  ACCEPTED: 'Accepted',
  TRAVELLING: 'On the way',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  PAYMENT_PENDING: 'Payment pending',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const STATUS_BADGE_CLASSES: Record<JobStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  OFFERED: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  TRAVELLING: 'bg-blue-100 text-blue-800',
  ARRIVED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  PAYMENT_PENDING: 'bg-orange-100 text-orange-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-200 text-gray-700',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as JobStatus] ?? status.replace(/_/g, ' ');
}

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status as JobStatus] ?? 'bg-gray-100 text-gray-700';
}

/** Money arrives as paise; the dashboard renders rupees. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Short form for tables; the full id stays available in the detail view. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface AdminJobPerson {
  id: string;
  displayName: string | null;
  phone: string | null;
}

export interface AdminJobPlace {
  id: string;
  name: string;
  slug: string;
}

export interface AdminJobListItem {
  id: string;
  status: JobStatus;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  locationLabel: string | null;
  basePayPaise: number;
  agreedPayPaise: number | null;
  finalPayPaise: number | null;
  /** The customer's free-text category when the skill is `other`. */
  customSkill: string | null;
  customer: AdminJobPerson;
  pro: AdminJobPerson | null;
  service: AdminJobPlace;
  skill: AdminJobPlace;
}

export type JobStatusActorRole = 'PRO' | 'CUSTOMER' | 'SUPPORT' | 'SYSTEM';

/** Who drove a status change; the API resolves the name, never the raw user id. */
export interface AdminJobStatusActor {
  /** ProProfile / CustomerProfile id, for linking to the party's page. */
  id: string | null;
  name: string | null;
  role: JobStatusActorRole;
}

export interface AdminJobStatusEntry {
  id: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedBy: AdminJobStatusActor;
  createdAt: string;
}

export interface AdminJobOffer {
  id: string;
  proId: string;
  expiresAt: string;
  consumedAt: string | null;
  outcome: string | null;
  createdAt: string;
}

export interface AdminJobDecline {
  id: string;
  proId: string;
  createdAt: string;
}

export interface AdminJobDetailCustomer {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  profile: { fullName: string | null; phone: string | null; isActive: boolean };
}

export interface AdminJobDetailPro {
  id: string;
  displayName: string | null;
  isOnline: boolean;
  isVerified: boolean;
  rating: number | null;
  completedJobs: number;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  profile: { fullName: string | null; phone: string | null };
}

export interface AdminJobDetail extends Omit<AdminJobListItem, 'customer' | 'pro'> {
  updatedAt: string;
  customSkill: string | null;
  description: string;
  imageUrls: string[];
  latitude: number | null;
  longitude: number | null;
  /** Always null: the start code belongs to the customer alone. */
  verificationOtp: null;
  startOtpAttempts: number;
  customer: AdminJobDetailCustomer;
  pro: AdminJobDetailPro | null;
  statusHistory: AdminJobStatusEntry[];
  offers: AdminJobOffer[];
  declines: AdminJobDecline[];
}

export interface AdminJobListResponse {
  data: AdminJobListItem[];
  nextCursor: string | null;
}

export interface AdminJobDetailResponse {
  data: AdminJobDetail;
}
