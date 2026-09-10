import { Pressable, View, type PressableProps } from 'react-native';
import { router } from 'expo-router';
import { type Job, type JobStatus } from '@samona/types';
import { UnreadBadge } from '@/components/chat';
import { ServiceImage } from '@/components/home/ServiceImage';
import { Text } from '@/components/ui';
import { useUnreadMessages } from '@/hooks';
import { cn } from '@/utils/cn';
import { formatBookingDate } from '@/utils/format';

const STATUS_PRESENTATION: Record<JobStatus, { label: string }> = {
  REQUESTED: { label: 'Requested' },
  OFFERED: { label: 'Offered' },
  ACCEPTED: { label: 'Accepted' },
  TRAVELLING: { label: 'On the way' },
  ARRIVED: { label: 'Arrived' },
  IN_PROGRESS: { label: 'In progress' },
  COMPLETED: { label: 'Completed' },
  PAYMENT_PENDING: { label: 'Payment pending' },
  PAID: { label: 'Paid' },
  CANCELLED: { label: 'Cancelled' },
  EXPIRED: { label: 'Expired' },
};

/** Human label for a job status, shared with the booking detail screen. */
export function bookingStatusLabel(status: JobStatus): string {
  return STATUS_PRESENTATION[status]?.label ?? 'Unknown';
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
      className={cn('bg-background py-3 active:opacity-70', className)}
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
          <Text variant="footnote" numberOfLines={1} className="mt-0.5 text-text-secondary">
            {bookingStatusLabel(job.status)} · {dateLabel}
          </Text>
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-muted">
            {job.description}
          </Text>
        </View>
      </View>

      {/* Thin divider between list rows, bleeding to the screen edges. */}
      <View className="my-2 -mx-5 h-px bg-border" />
    </Pressable>
  );
}
