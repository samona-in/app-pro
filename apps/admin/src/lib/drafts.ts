/**
 * Shapes and display helpers for the admin booking-cart analytics.
 *
 * These mirror `AdminBookingDraftOverview` in `@samona/types` and the response
 * built by `server/src/admin/drafts/admin-drafts.routes.ts`. The admin app is a
 * separate deployment and does not import the shared package, so keep the two
 * in sync by hand when the draft lifecycle changes.
 */

export const DRAFT_STATUSES = ['ACTIVE', 'CONVERTED', 'ABANDONED'] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

const STATUS_LABELS: Record<DraftStatus, string> = {
  ACTIVE: 'In progress',
  CONVERTED: 'Booked',
  ABANDONED: 'Abandoned',
};

const STATUS_BADGE_CLASSES: Record<DraftStatus, string> = {
  ACTIVE: 'bg-blue-100 text-blue-800',
  CONVERTED: 'bg-emerald-100 text-emerald-800',
  ABANDONED: 'bg-gray-200 text-gray-700',
};

export function draftStatusLabel(status: string): string {
  return STATUS_LABELS[status as DraftStatus] ?? status.replace(/_/g, ' ');
}

export function draftStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status as DraftStatus] ?? 'bg-gray-100 text-gray-700';
}

/** One service's share of draft activity. */
export interface BookingDraftServiceActivity {
  serviceId: string;
  serviceName: string;
  active: number;
  converted: number;
  abandoned: number;
  total: number;
}

/** A recent cart row. */
export interface AdminBookingDraftSummary {
  id: string;
  status: DraftStatus;
  serviceName: string;
  customerName: string | null;
  worksCount: number;
  estimatedTotalPaise: number;
  updatedAt: string;
}

/** Aggregated draft activity returned by `GET /admin/drafts`. */
export interface AdminBookingDraftOverview {
  generatedAt: string;
  totals: {
    active: number;
    converted: number;
    abandoned: number;
    total: number;
  };
  byService: BookingDraftServiceActivity[];
  recent: AdminBookingDraftSummary[];
}
