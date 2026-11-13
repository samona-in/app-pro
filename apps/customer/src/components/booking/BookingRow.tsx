import { Pressable, View, type PressableProps } from 'react-native';
import { router } from 'expo-router';
import { type Job, type JobStatus, workSummaryLabel } from '@samona/types';
import { UnreadBadge } from '@/components/chat';
import { ServiceImage } from '@/components/home/ServiceImage';
import { Text } from '@/components/ui';
import { useUnreadMessages } from '@/hooks';
import { cn } from '@/utils/cn';
import { formatBookingDate, formatRupees } from '@/utils/format';
import { describeJobQuantity, describeJobWorks, jobItemName } from '@/utils/pricing';

const STATUS_PRESENTATION: Record<JobStatus, { label: string }> = {
  REQUESTED: { label: 'Requested' },
  OFFERED: { label: 'Offered' },
  ACCEPTED: { label: 'Accepted' },
  TRAVELLING: { label: 'On the way' },
  ARRIVED: { label: 'Arrived' },
  IN_PROGRESS: { label: 'In progress' },
  COMPLETED: { label: 'Payment pending' },
  PAYMENT_PENDING: { label: 'Payment pending' },
  PAID: { label: 'Paid' },
  CANCELLED: { label: 'Cancelled' },
  EXPIRED: { label: 'Expired' },
};

/** Human label for a job status, shared with the booking detail screen. */
export function bookingStatusLabel(status: JobStatus): string {
  return STATUS_PRESENTATION[status]?.label ?? 'Unknown';
}

/** The colour a status wears in the list — the same hues as the detail screen. */
type StatusTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted';

const STATUS_TONE: Record<JobStatus, StatusTone> = {
  REQUESTED: 'brand',
  OFFERED: 'brand',
  ACCEPTED: 'brand',
  TRAVELLING: 'brand',
  ARRIVED: 'brand',
  IN_PROGRESS: 'brand',
  COMPLETED: 'warning',
  PAYMENT_PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'muted',
};

const TONE_DOT: Record<StatusTone, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-text-muted',
};

const TONE_TEXT: Record<StatusTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-text-muted',
};

export interface BookingRowProps extends Omit<PressableProps, 'style'> {
  job: Job;
  /**
   * How many bookings were placed together with this one (same checkout).
   * Undefined or 1 means this booking stands alone.
   */
  groupServiceCount?: number;
  className?: string;
}

/**
 * One booking in the customer's list — a quiet row: the artwork, what was
 * booked, the service it sits under, the amount, and the status.
 *
 * The row carries no card chrome. The separator between rows belongs to the
 * list, which draws it as a hairline across the full width of the screen.
 */
export function BookingRow({ job, groupServiceCount, className, ...rest }: BookingRowProps) {
  const unread = useUnreadMessages();
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  // A bulk visit reads as its works ("Regular Tap Repair + 2 more works");
  // a single work keeps its own title, "other" bookings carry free text.
  const isBulk = (job.items?.length ?? 0) > 1 || job.orderType === 'BULK';
  const title = isBulk
    ? workSummaryLabel((job.items ?? []).map(jobItemName))
    : job.customSkill?.trim() || job.skill.name;
  const quantity = isBulk ? describeJobWorks(job) : describeJobQuantity(job);
  const tone = STATUS_TONE[job.status] ?? 'muted';
  // "Other" work has no image of its own, so it keeps the service artwork.
  const artwork = job.skill.icon ?? job.service.icon;
  // Jobs from one multi-service checkout share an orderGroupId. Naming the
  // group here explains why several unrelated-looking bookings appeared at
  // once, without merging their independent lifecycles.
  const placedTogether =
    job.orderGroupId && (groupServiceCount ?? 1) > 1
      ? `Placed together · ${groupServiceCount} services`
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} booking, ${bookingStatusLabel(job.status)}`}
      onPress={() => router.push(`/booking/${job.id}`)}
      className={cn('flex-row items-center gap-3 px-4 py-3 active:opacity-70', className)}
      {...rest}
    >
      <View className="relative">
        <ServiceImage uri={artwork} accessibilityLabel={title} className="h-14 w-14 rounded-lg" />
        {/* Unread-chat badge pinned to the thumbnail; the row opens the booking. */}
        <UnreadBadge count={unread.countFor(job.id)} className="absolute -right-2 -top-2" />
      </View>

      <View className="flex-1">
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" className="mt-0.5 text-text-secondary" numberOfLines={1}>
          {job.service.name} · {formatBookingDate(job.createdAt)}
          {quantity ? ` · ${quantity}` : ''}
        </Text>
        {placedTogether ? (
          <Text variant="caption" className="mt-0.5 font-semibold text-brand" numberOfLines={1}>
            {placedTogether}
          </Text>
        ) : null}
      </View>

      <View className="items-end">
        <Text variant="body" className="font-semibold">
          {formatRupees(amount)}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <View className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
          <Text variant="caption" className={cn('font-semibold', TONE_TEXT[tone])}>
            {bookingStatusLabel(job.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
