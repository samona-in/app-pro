import type { ServiceRequestStatus } from '@samona/types';
import { Badge, type BadgeTone } from '@/components/ui';

export const REQUEST_STATUS_META: Record<
  ServiceRequestStatus,
  { label: string; tone: BadgeTone }
> = {
  REQUESTED: { label: 'Requested', tone: 'info' },
  DISPATCHING: { label: 'Finding a pro', tone: 'info' },
  CHOOSING_PRO: { label: 'Choose a pro', tone: 'warning' },
  OPEN: { label: 'Getting offers', tone: 'info' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  TRAVELLING: { label: 'On the way', tone: 'info' },
  ARRIVED: { label: 'Arrived', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

/** One badge per request state, so no screen invents a label or a colour. */
export function RequestStatusBadge({ status }: { status: ServiceRequestStatus }) {
  const meta = REQUEST_STATUS_META[status];
  return <Badge label={meta.label} tone={meta.tone} withDot />;
}