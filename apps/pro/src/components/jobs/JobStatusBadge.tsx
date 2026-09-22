import { useTranslation } from 'react-i18next';
import type { JobStatus } from '@samona/types';
import { Badge, type BadgeTone } from '@/components/ui';
import type { TranslationKey } from '@/i18n';

const STATUS_META: Record<JobStatus, { labelKey: TranslationKey; tone: BadgeTone }> = {
  REQUESTED: { labelKey: 'jobStatus.requested', tone: 'info' },
  OFFERED: { labelKey: 'jobStatus.offered', tone: 'warning' },
  ACCEPTED: { labelKey: 'jobStatus.accepted', tone: 'success' },
  TRAVELLING: { labelKey: 'jobStatus.travelling', tone: 'info' },
  ARRIVED: { labelKey: 'jobStatus.arrived', tone: 'info' },
  IN_PROGRESS: { labelKey: 'jobStatus.inProgress', tone: 'warning' },
  COMPLETED: { labelKey: 'jobStatus.completed', tone: 'neutral' },
  PAYMENT_PENDING: { labelKey: 'jobStatus.paymentPending', tone: 'warning' },
  PAID: { labelKey: 'jobStatus.paid', tone: 'success' },
  CANCELLED: { labelKey: 'jobStatus.cancelled', tone: 'danger' },
  EXPIRED: { labelKey: 'jobStatus.expired', tone: 'neutral' },
};

/** One badge per job state, so no screen invents a label or a colour again. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  return <Badge label={t(meta.labelKey)} tone={meta.tone} withDot />;
}