import { Pressable, View, type PressableProps } from 'react-native';
import { router } from 'expo-router';
import { type Job, type JobStatus } from '@samona/types';
import { UnreadBadge } from '@/components/chat';
import { ServiceImage } from '@/components/home/ServiceImage';
import { Badge, Text } from '@/components/ui';
import { useUnreadMessages } from '@/hooks';
import { cn } from '@/utils/cn';
import { formatRupees } from '@/utils/format';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_PRESENTATION: Record<JobStatus, { label: string; tone: BadgeTone }> = {
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

export function bookingStatusLabel(status: JobStatus): string {
  return STATUS_PRESENTATION[status]?.label ?? 'Unknown';
}

function statusTone(status: JobStatus): BadgeTone {
  return STATUS_PRESENTATION[status]?.tone ?? 'neutral';
}

export interface BookingCardProps extends Omit<PressableProps, 'style'> {
  job: Job;
  className?: string;
}

/**
 * One booking in the customer's list. Tapping it opens the booking detail.
 */
export function BookingCard({ job, className, ...rest }: BookingCardProps) {
  const unread = useUnreadMessages();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.service.name} booking`}
      onPress={() => router.push(`/booking/${job.id}`)}
      className={cn('active:opacity-70', className)}
      {...rest}
    >
      <View className="relative flex-row items-center rounded-xl border border-border bg-surface p-4">
        <ServiceImage
          uri={job.service.icon}
          accessibilityLabel={job.service.name}
          className="h-12 w-12 rounded-lg"
        />

        <View className="ml-3 flex-1">
          <View className="flex-row items-center justify-between">
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
              {job.service.name}
            </Text>
            <Badge
              label={bookingStatusLabel(job.status)}
              tone={statusTone(job.status)}
              className="ml-2"
            />
          </View>
          <Text variant="caption" numberOfLines={1} className="mt-0.5">
            {job.skill.name}
          </Text>
          <View className="mt-1 flex-row items-center justify-between">
            <Text variant="footnote">{formatRupees(job.basePayPaise)}</Text>
            <Text variant="caption">{placeLabel(job)}</Text>
          </View>
        </View>

        {/* Unread-chat badge pinned to the top-right corner; the card is the
            customer's chat entry point, so an unanswered message reads as a
            pending-booking signal. */}
        <UnreadBadge count={unread.countFor(job.id)} className="absolute -right-2 -top-2" />
      </View>
    </Pressable>
  );
}

function placeLabel(job: Job): string {
  if (job.placeType === 'OTHER') return job.placeDescription ?? 'Other';
  return job.placeType.charAt(0) + job.placeType.slice(1).toLowerCase();
}
