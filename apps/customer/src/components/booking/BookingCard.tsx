import { Pressable, View, type PressableProps } from 'react-native';
import { router } from 'expo-router';
import { type Job, type JobStatus } from '@samona/types';
import { UnreadBadge } from '@/components/chat';
import { ServiceImage } from '@/components/home/ServiceImage';
import { Text } from '@/components/ui';
import { useUnreadMessages } from '@/hooks';
import { cn } from '@/utils/cn';
import { formatBookingDate, formatRupees } from '@/utils/format';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_PRESENTATION: Record<JobStatus, { label: string; tone: StatusTone }> = {
  REQUESTED: { label: 'Requested', tone: 'info' },
  OFFERED: { label: 'Offered', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  TRAVELLING: { label: 'On the way', tone: 'info' },
  ARRIVED: { label: 'Arrived', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-text-secondary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function bookingStatusLabel(status: JobStatus): string {
  return STATUS_PRESENTATION[status]?.label ?? 'Unknown';
}

function statusTone(status: JobStatus): StatusTone {
  return STATUS_PRESENTATION[status]?.tone ?? 'neutral';
}

export interface BookingCardProps extends Omit<PressableProps, 'style'> {
  job: Job;
  className?: string;
}

/**
 * One booking in the customer's list — a borderless, flat list row (no card).
 * Tapping it opens the booking detail.
 */
export function BookingCard({ job, className, ...rest }: BookingCardProps) {
  const unread = useUnreadMessages();
  const dateLabel = formatBookingDate(job.createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.service.name} booking`}
      onPress={() => router.push(`/booking/${job.id}`)}
      className={cn('bg-background py-5 active:opacity-70', className)}
      {...rest}
    >
      <View className="flex-row items-start">
        <View className="relative">
          <ServiceImage
            uri={job.service.icon}
            accessibilityLabel={job.service.name}
            className="h-12 w-12 rounded-xl"
          />
          {/* Unread-chat badge pinned to the thumbnail; the row opens the chat thread. */}
          <UnreadBadge count={unread.countFor(job.id)} className="absolute -right-2 -top-2" />
        </View>

        <View className="ml-3.5 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {job.service.name}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            className={cn('mt-0.5 font-medium', TONE_TEXT[statusTone(job.status)])}
          >
            {bookingStatusLabel(job.status)} • {dateLabel}
          </Text>
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-muted">
            {job.description}
          </Text>
          <View className="mt-1 flex-row items-center justify-between">
            <Text variant="footnote">{formatRupees(job.basePayPaise)}</Text>
            <Text variant="caption" className="text-text-muted">
              {placeLabel(job)}
            </Text>
          </View>
        </View>
      </View>

      {/* Thin divider between list rows, inset so it starts at the text column. */}
      <View className="my-3 ml-[62px] h-px bg-border" />
    </Pressable>
  );
}

function placeLabel(job: Job): string {
  if (job.placeType === 'OTHER') return job.placeDescription ?? 'Other';
  return job.placeType.charAt(0) + job.placeType.slice(1).toLowerCase();
}
