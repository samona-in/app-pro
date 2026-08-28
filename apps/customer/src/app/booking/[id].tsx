import { Image, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { JobStatus, type Job } from '@samona/types';
import { bookingStatusLabel } from '@/components/booking';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Badge, Card, Divider, Screen, Text } from '@/components/ui';
import { useBooking } from '@/hooks';
import { color } from '@/theme';
import { formatRupees } from '@/utils/format';

const TIMELINE: { status: JobStatus; label: string }[] = [
  { status: JobStatus.REQUESTED, label: 'Requested' },
  { status: JobStatus.ACCEPTED, label: 'Professional accepted' },
  { status: JobStatus.TRAVELLING, label: 'On the way' },
  { status: JobStatus.ARRIVED, label: 'Arrived' },
  { status: JobStatus.IN_PROGRESS, label: 'Work in progress' },
  { status: JobStatus.COMPLETED, label: 'Completed' },
];

function currentStepIndex(job: Job): number {
  const index = TIMELINE.findIndex((step) => step.status === job.status);
  return index === -1 ? 0 : index;
}

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isPending, isError, refetch } = useBooking(id);

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

  return (
    <Screen scrollable edges={['top', 'bottom']} className="bg-background">
      <View className="pt-4">
        <Badge label={bookingStatusLabel(job.status)} tone="info" withDot />
        <Text variant="titleLg" className="mt-3">
          {job.service.name}
        </Text>
        <Text variant="footnote" className="mt-1">
          {job.skill.name} · placed {formatDate(job.createdAt)}
        </Text>
      </View>

      <Card className="mt-6">
        <Text variant="label">Professional</Text>
        <View className="mt-1 flex-row items-center">
          <Ionicons
            name={job.proId ? 'person' : 'search-outline'}
            size={18}
            color={color['text-secondary']}
          />
          <Text variant="bodyLg" className="ml-2">
            {job.proId ? 'A professional is on this job' : 'Looking for a professional'}
          </Text>
        </View>
        <Text variant="footnote" className="mt-1">
          {job.proId
            ? 'Professional details appear here once the job is underway.'
            : 'We notify you the moment someone accepts your request.'}
        </Text>
        <Divider spaced />

        <Text variant="label">Where</Text>
        <Text variant="bodyLg" className="mt-1">
          {job.placeType === 'OTHER' ? (job.placeDescription ?? 'Other') : humanize(job.placeType)}
        </Text>
        <Divider spaced />

        <Text variant="label">Base pay</Text>
        <Text variant="bodyLg" className="mt-1">
          {formatRupees(job.basePayPaise)}
        </Text>
        <Text variant="footnote" className="mt-1">
          The guaranteed amount offered. The final price is agreed with the professional before
          payment.
        </Text>
      </Card>

      <Card className="mt-4">
        <Text variant="label">What's needed</Text>
        <Text variant="body" className="mt-1">
          {job.description}
        </Text>
      </Card>

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
