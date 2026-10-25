/**
 * Shapes and helpers for the admin live operations board.
 *
 * Mirrors `server/src/admin/live/admin-live.routes.ts`: a single unpaginated
 * snapshot of today's still-open jobs, plus counts. As with `lib/jobs.ts`, the
 * admin app does not import `@samona/types`; keep the status lists in sync.
 */

import type { AdminJobListItem, JobStatus } from './jobs';

export type AdminLiveSort = 'newest' | 'oldest' | 'amount_desc' | 'expiring';

/** Still-open work — everything before a terminal state. */
export const LIVE_JOB_STATUSES: readonly JobStatus[] = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'TRAVELLING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
];

export const LIVE_SORT_OPTIONS: ReadonlyArray<{ value: AdminLiveSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'expiring', label: 'Expiring soon' },
];

export const LIVE_TIME_ZONE = 'Asia/Kolkata';

export interface AdminLiveSummary {
  total: number;
  waitingForPro: number;
  enRoute: number;
  inProgress: number;
  paymentPending: number;
  overdue: number;
}

export interface AdminLiveDay {
  /** ISO instant of midnight IST. */
  start: string;
  /** ISO instant of the next midnight IST (exclusive). */
  end: string;
  timeZone: string;
}

export interface AdminLiveResponse {
  data: AdminJobListItem[];
  summary: AdminLiveSummary;
  day: AdminLiveDay;
  generatedAt: string;
  /** True when the day holds more rows than the server's hard cap. */
  truncated: boolean;
}

/** A live snapshot is always "today", so the heading reads from `day.start`. */
export function formatLiveDate(day: AdminLiveDay | undefined): string {
  if (!day) return 'Today';
  const date = new Date(day.start);
  if (Number.isNaN(date.getTime())) return 'Today';
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: day.timeZone,
  });
}

/** `09:01 pm` in IST — the board's own time zone, not the viewer's. */
export function formatLiveTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LIVE_TIME_ZONE,
  });
}

/**
 * How long a job has been waiting, in the compact form an operator scans:
 * `8m`, `2h 14m`, `3d`. Negative spans (clock skew) read as `just now`.
 */
export function formatAge(iso: string, now: number = Date.now()): string {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start) || !Number.isFinite(now)) return '—';
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

export interface ExpiryState {
  label: string;
  /** Past its expiry and still in a waiting state. */
  overdue: boolean;
}

/** Countdown to `expiresAt`, used to spot jobs that need chasing. */
export function expiryState(
  iso: string | null | undefined,
  now: number = Date.now(),
): ExpiryState | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at) || !Number.isFinite(now)) return null;

  const minutes = Math.round(Math.abs(at - now) / 60_000);
  const amount = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

  return at <= now
    ? { label: `overdue ${amount}`, overdue: true }
    : { label: `in ${amount}`, overdue: false };
}

/** URL's `status` value → the statuses the API should filter on. */
export function resolveLiveStatuses(value: string): readonly JobStatus[] | undefined {
  switch (value) {
    case '':
      return undefined;
    case 'waiting':
      return ['REQUESTED', 'OFFERED'];
    case 'en_route':
      return ['TRAVELLING'];
    case 'working':
      return ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
    case 'payment':
      return ['COMPLETED', 'PAYMENT_PENDING'];
    default:
      return LIVE_JOB_STATUSES.includes(value as JobStatus) ? [value as JobStatus] : undefined;
  }
}
