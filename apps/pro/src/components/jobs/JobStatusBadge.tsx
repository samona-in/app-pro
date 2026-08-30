import type { JobStatus } from '@samona/types';
import { Badge, type BadgeTone } from '@/components/ui';

const STATUS_META: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  REQUESTED: { label: 'Requested', tone: 'info' },
  OFFERED: { label: 'Offered', tone: 'warning' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  TRAVELLING: { label: 'On the way', tone: 'info' },
  ARRIVED: { label: 'Arrived', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

/** One badge per job state, so no screen invents a label or a colour again. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  return <Badge label={meta.label} tone={meta.tone} withDot />;
}