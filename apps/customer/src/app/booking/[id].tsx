import type { ComponentProps } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isChatClosed, JobStatus } from '@samona/types';
import { bookingStatusLabel, proDisplayName } from '@/components/booking';
import { UnreadBadge } from '@/components/chat';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Avatar, Button, Screen, Text } from '@/components/ui';
import { useBooking, useCancelBooking, useSubmitGuard, useUnreadMessages } from '@/hooks';
import { color } from '@/theme';
import {
  formatBookingDate,
  formatChatTime,
  formatClockTime,
  formatJobDate,
  formatRupees,
} from '@/utils/format';

/**
 * Statuses the customer may still cancel: only before the professional starts
 * the work. Once the job is in progress there is no turning back — the last
 * chance is after arrival, when the pro has seen the job and can hand it back.
 */
const CANCELLABLE: JobStatus[] = [
  JobStatus.REQUESTED,
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
];

function canCancel(status: JobStatus): boolean {
  return CANCELLABLE.includes(status);
}

/** Icon and background colour for each booking status. */
type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const STATUS_ICON: Record<JobStatus, { icon: IoniconsName; surface: string; tint: string }> = {
  REQUESTED: { icon: 'time-outline', surface: 'bg-info-surface', tint: color.info },
  OFFERED: { icon: 'time-outline', surface: 'bg-info-surface', tint: color.info },
  ACCEPTED: {
    icon: 'checkmark-circle-outline',
    surface: 'bg-info-surface',
    tint: color.info,
  },
  TRAVELLING: {
    icon: 'navigate-outline',
    surface: 'bg-info-surface',
    tint: color.info,
  },
  ARRIVED: {
    icon: 'location-outline',
    surface: 'bg-info-surface',
    tint: color.info,
  },
  IN_PROGRESS: {
    icon: 'construct-outline',
    surface: 'bg-info-surface',
    tint: color.info,
  },
  COMPLETED: {
    icon: 'cash-outline',
    surface: 'bg-warning-surface',
    tint: color.warning,
  },
  PAYMENT_PENDING: {
    icon: 'cash-outline',
    surface: 'bg-warning-surface',
    tint: color.warning,
  },
  PAID: {
    icon: 'checkmark-circle-outline',
    surface: 'bg-success-surface',
    tint: color.success,
  },
  CANCELLED: {
    icon: 'close-circle-outline',
    surface: 'bg-danger-surface',
    tint: color.danger,
  },
  EXPIRED: {
    icon: 'time-outline',
    surface: 'bg-surface-muted',
    tint: color['text-secondary'],
  },
};

/**
 * Compound "call + message" contact button in the native header. A chat-bubble
 * glyph with a small call badge reads as both ways to reach the professional;
 * the 44pt surface circle keeps it consistent with IconButton. Only rendered
 * once a pro is assigned — before that there is nobody to reach. The red dot in
 * the corner carries how many pro messages are still unread.
 */
function CallMessageButton({ jobId, unread }: { jobId: string; unread: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Call or message professional"
      onPress={() => router.push({ pathname: '/booking/[id]/chat', params: { id: jobId } })}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
    >
      <View>
        <Ionicons name="chatbubble-ellipses" size={22} color={color.brand} />
        <View className="absolute -bottom-1 -right-2 h-5 w-5 items-center justify-center rounded-full bg-brand">
          <Ionicons name="call" size={11} color={color['brand-contrast']} />
        </View>
      </View>
      <UnreadBadge count={unread} className="absolute -right-1 -top-1" />
    </Pressable>
  );
}

function formatCreatedAt(iso: string): string {
  return `${formatBookingDate(iso)} · ${formatChatTime(iso)}`;
}

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isPending, isError, refetch } = useBooking(id);
  const unread = useUnreadMessages();

  const cancel = useCancelBooking(id);
  const { run: requestCancel, isSubmitting: cancelling } = useSubmitGuard(() => {
    Alert.alert('Cancel this booking?', 'The job will be cancelled for everyone.', [
      { text: 'Keep the booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancel.mutateAsync();
            } catch (error) {
              Alert.alert(
                'Could not cancel this booking',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          })();
        },
      },
    ]);
  });

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 justify-center">
          <LoadingState message="Loading booking" size="inline" />
        </View>
      </Screen>
    );
  }

  if (isError || !job) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 justify-center">
          <ErrorState
            title="Couldn't load this booking"
            message="Check your connection and try again."
            onRetry={() => void refetch()}
          />
        </View>
      </Screen>
    );
  }

  const isTerminal = ([JobStatus.CANCELLED, JobStatus.EXPIRED] as JobStatus[]).includes(job.status);
  const isInProgress = job.status === JobStatus.IN_PROGRESS;
  const isPaid = job.status === JobStatus.PAID;
  const showTiming =
    (isInProgress || isPaid || job.completedAt !== null) && job.acceptedAt !== null;
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const paidLabel = isPaid ? 'Amount paid' : 'Amount';
  const statusVisual = STATUS_ICON[job.status] ?? STATUS_ICON[JobStatus.REQUESTED];

  return (
    <Screen scrollable edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {job.service.name}
              </Text>
              <Text variant="caption" className="text-text-secondary">
                {formatCreatedAt(job.createdAt)}
              </Text>
            </View>
          ),
          headerRight:
            job.pro && !isChatClosed(job.status)
              ? () => <CallMessageButton jobId={job.id} unread={unread.countFor(job.id)} />
              : undefined,
        }}
      />

      <View className="pt-4 flex-row items-center gap-3">
        <View
          className={`h-11 w-11 items-center justify-center rounded-xl ${statusVisual.surface}`}
        >
          <Ionicons name={statusVisual.icon} size={22} color={statusVisual.tint} />
        </View>
        <Text variant="bodyLg" className="font-semibold">
          {bookingStatusLabel(job.status)}
        </Text>
      </View>

      {job.status === JobStatus.ARRIVED && job.verificationOtp ? (
        <View className="mt-4 flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
            <Ionicons name="shield-checkmark-outline" size={22} color={color.brand} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" className="text-brand">
              Verification code
            </Text>
          </View>
          <Text
            variant="title"
            className="font-semibold"
            style={{ color: color.brand, letterSpacing: 4 }}
          >
            {job.verificationOtp}
          </Text>
        </View>
      ) : null}

      <View className="my-2 -mx-5 h-px bg-border" />

      <View className="py-4 flex-row items-center gap-3">
        {job.pro ? (
          <Avatar name={proDisplayName(job.pro)} uri={job.pro.photoUrl} size="md" />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
            <Ionicons name="search-outline" size={18} color={color['text-secondary']} />
          </View>
        )}
        <View className="flex-1">
          <Text variant="bodyLg" className="font-semibold">
            {job.pro
              ? job.pro.isDeleted
                ? 'Deleted Professional'
                : (job.pro.displayName ?? 'Professional assigned')
              : 'Looking for a professional'}
          </Text>
          <Text variant="footnote" className="mt-0.5 text-text-secondary">
            {job.pro
              ? job.pro.isDeleted
                ? 'This professional is no longer with Samona'
                : job.pro.rating !== null
                  ? `Rated ${job.pro.rating.toFixed(1)}`
                  : 'Professional on this job'
              : 'We notify you when someone accepts'}
          </Text>
        </View>
      </View>

      <View className="my-2 -mx-5 h-px bg-border" />

      <View className="py-4">
        <View className="flex-row items-center justify-between">
          <Text variant="label">{paidLabel}</Text>
          <Text variant="title" className="text-text-primary">
            {formatRupees(amount)}
          </Text>
        </View>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {job.agreedPayPaise || job.finalPayPaise
            ? 'The amount agreed with your professional.'
            : 'The guaranteed amount offered. The final price is agreed with the professional before payment.'}
        </Text>
      </View>

      {showTiming ? (
        <>
          <View className="my-2 -mx-5 h-px bg-border" />
          <View className="py-4 flex-row items-start gap-3">
            <View className="mt-0.5 h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
              <Ionicons name="time-outline" size={20} color={color['text-secondary']} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong">
                {formatJobDate((job.completedAt ?? job.acceptedAt) as string)}
              </Text>
              <View className="mt-1 flex-row items-center gap-4">
                <Text variant="footnote" className="text-text-secondary">
                  started {formatClockTime(job.acceptedAt as string)}
                </Text>
                {isPaid ? (
                  <Text variant="footnote" className="text-text-secondary">
                    completed {formatClockTime(job.completedAt as string)}
                  </Text>
                ) : isInProgress ? (
                  <Text variant="footnote" style={{ color: color.info }}>
                    In progress
                  </Text>
                ) : (
                  <Text variant="footnote" style={{ color: color.warning }}>
                    Payment pending
                  </Text>
                )}
              </View>
            </View>
          </View>
        </>
      ) : null}

      <View className="my-2 -mx-5 h-px bg-border" />

      <View className="py-4 flex-row items-start gap-3">
        <View className="mt-0.5 h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name="location-outline" size={20} color={color['text-secondary']} />
        </View>
        <View className="flex-1">
          <Text variant="label">Where</Text>
          <Text variant="body" className="mt-0.5" numberOfLines={2}>
            {job.locationLabel}
          </Text>
        </View>
      </View>

      <View className="my-2 -mx-5 h-px bg-border" />

      <View className="py-4">
        <Text variant="label">What's needed</Text>
        <Text variant="body" className="mt-1">
          {job.description}
        </Text>
      </View>

      {job.imageUrls.length > 0 ? (
        <>
          <View className="my-2 -mx-5 h-px bg-border" />
          <View className="py-4">
            <Text variant="label">Reference photos</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="flex-row gap-2 mt-2"
            >
              {job.imageUrls.map((url) => (
                <Image key={url} source={{ uri: url }} className="h-28 w-28 rounded-lg" />
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}

      {isTerminal ? (
        <View className="mt-4 rounded-xl border border-border bg-surface-muted p-4">
          <Text variant="body" className="text-center text-text-secondary">
            {job.status === JobStatus.CANCELLED
              ? 'This booking was cancelled.'
              : 'This request expired because no professional accepted it in time.'}
          </Text>
        </View>
      ) : null}

      {job.status === JobStatus.PAYMENT_PENDING ? (
        <View className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
          <Text variant="bodyStrong" className="text-brand">
            Pay your professional in cash
          </Text>
          <Text variant="footnote" className="mt-0.5 text-text-secondary">
            SAMONA takes cash only today. Settle the agreed amount with your professional; they'll
            confirm the collection on their side.
          </Text>
        </View>
      ) : canCancel(job.status) ? (
        <View className="mt-6 pb-4">
          <Button
            label="Cancel booking"
            variant="ghost"
            size="md"
            loading={cancelling}
            onPress={() => void requestCancel()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
