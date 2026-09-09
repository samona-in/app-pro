import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { JobStatus, type JobDetail } from '@samona/types';
import { bookingStatusLabel } from '@/components/booking';
import { UnreadBadge } from '@/components/chat';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import {
  useBooking,
  useCancelBooking,
  useSubmitGuard,
  useUnreadMessages,
} from '@/hooks';
import { color } from '@/theme';
import { formatRupees } from '@/utils/format';

const TIMELINE: { status: JobStatus; label: string }[] = [
  { status: JobStatus.REQUESTED, label: 'Requested' },
  { status: JobStatus.ACCEPTED, label: 'Professional accepted' },
  { status: JobStatus.TRAVELLING, label: 'On the way' },
  { status: JobStatus.ARRIVED, label: 'Arrived' },
  { status: JobStatus.IN_PROGRESS, label: 'Work in progress' },
  { status: JobStatus.COMPLETED, label: 'Completed' },
  { status: JobStatus.PAYMENT_PENDING, label: 'Awaiting payment' },
  { status: JobStatus.PAID, label: 'Paid' },
];

function currentStepIndex(job: JobDetail): number {
  const index = TIMELINE.findIndex((step) => step.status === job.status);
  return index === -1 ? 0 : index;
}

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
  const step = currentStepIndex(job);
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const paidLabel = job.status === JobStatus.PAID ? 'Amount paid' : 'Amount';

  return (
    <Screen scrollable edges={['top', 'bottom']} className="bg-background">
      {job.pro ? (
        <Stack.Screen
          options={{
            headerRight: () => (
              <CallMessageButton jobId={job.id} unread={unread.countFor(job.id)} />
            ),
          }}
        />
      ) : null}

      <View className="pt-4">
        <Badge label={bookingStatusLabel(job.status)} tone="info" withDot />
        <Text variant="titleLg" className="mt-3">
          {job.service.name}
        </Text>
        <Text variant="footnote" className="mt-1">
          {job.customSkill ?? job.skill.name} · placed {formatDate(job.createdAt)}
        </Text>
      </View>

      <Card className="mt-6">
        <Text variant="label">Professional</Text>
        <View className="mt-1 flex-row items-center">
          <Ionicons
            name={job.pro ? 'person' : 'search-outline'}
            size={18}
            color={color['text-secondary']}
          />
          <Text variant="bodyLg" className="ml-2">
            {job.pro
              ? (job.pro.displayName ?? 'Professional assigned')
              : 'Looking for a professional'}
          </Text>
        </View>
        <Text variant="footnote" className="mt-1">
          {job.pro
            ? job.pro.rating !== null
              ? `Rated ${job.pro.rating.toFixed(1)} · ${job.pro.displayName ?? 'your pro'} is on this job`
              : 'A professional is on this job.'
            : 'We notify you the moment someone accepts your request.'}
        </Text>
        <Divider spaced />

        <Text variant="label">Where</Text>
        <Text variant="bodyLg" className="mt-1">
          {job.placeType === 'OTHER' ? (job.placeDescription ?? 'Other') : humanize(job.placeType)}
        </Text>
        <Divider spaced />

        <View className="flex-row items-center justify-between">
          <Text variant="label">{paidLabel}</Text>
          <Text variant="title">{formatRupees(amount)}</Text>
        </View>
        <Text variant="footnote" className="mt-1">
          {job.agreedPayPaise || job.finalPayPaise
            ? 'The amount agreed with your professional.'
            : 'The guaranteed amount offered. The final price is agreed with the professional before payment.'}
        </Text>
      </Card>

      <Card className="mt-4">
        <Text variant="label">What's needed</Text>
        <Text variant="body" className="mt-1">
          {job.description}
        </Text>
      </Card>

      {job.status === JobStatus.ARRIVED && job.verificationOtp ? (
        <Card className="mt-4 border-brand bg-brand-soft">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface">
              <Ionicons name="shield-checkmark-outline" size={24} color={color.brand} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong" className="text-brand">
                Your verification code
              </Text>
              <Text variant="footnote" className="mt-0.5 text-text-secondary">
                Read this out to your professional so they can start work.
              </Text>
            </View>
          </View>
          <Text
            variant="display"
            className="mt-4 text-center"
            style={{ color: color.brand, letterSpacing: 6 }}
          >
            {job.verificationOtp}
          </Text>
        </Card>
      ) : null}

      {job.imageUrls.length > 0 ? (
        <Card className="mt-4" padded={false}>
          <View className="px-4 pb-3 pt-4">
            <Text variant="label">Reference photos</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="flex-row gap-2 px-4 pb-4"
          >
            {job.imageUrls.map((url) => (
              <Image key={url} source={{ uri: url }} className="h-28 w-28 rounded-lg" />
            ))}
          </ScrollView>
        </Card>
      ) : null}

      <Text variant="title" className="mt-8">
        Progress
      </Text>

      <Card className="mt-3" padded={false}>
        {TIMELINE.map((item, index) => {
          const isDone = index <= step;
          const isCurrent = item.status === job.status;
          return (
            <View key={item.status}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center px-4 py-4">
                <View
                  className={
                    isDone
                      ? 'mr-3 h-2.5 w-2.5 rounded-full bg-success'
                      : 'mr-3 h-2.5 w-2.5 rounded-full bg-border-strong'
                  }
                />
                <Text
                  variant={isDone ? 'bodyStrong' : 'body'}
                  className={isDone ? undefined : 'text-text-secondary'}
                >
                  {item.label}
                </Text>
                {isCurrent ? <Badge label="Current" className="ml-2" /> : null}
              </View>
            </View>
          );
        })}
      </Card>

      {isTerminal ? (
        <View className="mt-6 rounded-xl border border-border bg-surface-muted p-4">
          <Text variant="body" className="text-center text-text-secondary">
            {job.status === JobStatus.CANCELLED
              ? 'This booking was cancelled.'
              : 'This request expired because no professional accepted it in time.'}
          </Text>
        </View>
      ) : null}

      {job.status === JobStatus.PAYMENT_PENDING ? (
        <View className="mt-8 gap-3 pb-4">
          <View className="rounded-xl border border-brand bg-brand-soft p-4">
            <Text variant="bodyStrong" className="text-brand">
              Pay your professional in cash
            </Text>
            <Text variant="footnote" className="mt-0.5 text-text-secondary">
              SAMONA takes cash only today. Settle the agreed amount with your
              professional; they'll confirm the collection on their side.
            </Text>
          </View>
        </View>
      ) : canCancel(job.status) ? (
        <View className="mt-8 gap-3 pb-4">
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

function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
