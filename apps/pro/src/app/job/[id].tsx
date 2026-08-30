import { useMemo } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { JobStatus, type JobStatus as Status } from '@samona/types';
import { EmptyState } from '@/components/feedback';
import { JobStatusBadge } from '@/components/jobs';
import { Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useCancelJob, useProJobs, useSubmitGuard, useTransitionJob } from '@/hooks';
import type { ProJobTransitionAction } from '@/services/jobs';
import { color } from '@/theme';
import { formatInr } from '@/utils/format';

/**
 * On-site journey once the pro has accepted the job. The server validates
 * every step against the state machine; the button only requests it.
 */
const STAGES: { status: Status; label: string }[] = [
  { status: JobStatus.ACCEPTED, label: 'Job accepted' },
  { status: JobStatus.TRAVELLING, label: 'On the way' },
  { status: JobStatus.ARRIVED, label: 'Arrived' },
  { status: JobStatus.IN_PROGRESS, label: 'Working' },
  { status: JobStatus.PAYMENT_PENDING, label: 'Completed, awaiting payment' },
];

const NEXT_ACTIONS: Partial<
  Record<Status, { action: ProJobTransitionAction; label: string; variant: 'primary' | 'success' }>
> = {
  ACCEPTED: { action: 'travel', label: "Start trip — I'm on my way", variant: 'primary' },
  TRAVELLING: { action: 'arrived', label: 'I have arrived', variant: 'primary' },
  ARRIVED: { action: 'start', label: 'Start the job', variant: 'success' },
  IN_PROGRESS: { action: 'complete', label: 'Complete the job', variant: 'success' },
};

interface ActionConfig {
  action: ProJobTransitionAction;
  label: string;
  variant: 'primary' | 'success';
}

/**
 * What to show under the progress card: a live transition, a terminal notice,
 * or nothing at all (cancelled/expired).
 */
function actionFor(
  status: Status,
): { kind: 'transition'; config: ActionConfig } | { kind: 'notice'; label: string; variant: 'secondary' | 'success' } | null {
  const config = NEXT_ACTIONS[status];
  if (config) return { kind: 'transition', config };
  if (status === JobStatus.PAYMENT_PENDING) {
    return { kind: 'notice', label: 'Payment pending', variant: 'secondary' };
  }
  if (status === JobStatus.PAID) {
    return { kind: 'notice', label: 'Paid in full', variant: 'success' };
  }
  return null;
}

/** A live job the pro is working can still be cancelled before the money moves. */
function canCancel(status: Status): boolean {
  return status === JobStatus.ACCEPTED || status === JobStatus.TRAVELLING || status === JobStatus.ARRIVED;
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: jobs, isPending } = useProJobs();
  const jobId = id;
  const transition = useTransitionJob();
  const cancel = useCancelJob();
  const { run, isSubmitting } = useSubmitGuard(async (action: ProJobTransitionAction) => {
    try {
      await transition.mutateAsync({ jobId, action });
    } catch (error) {
      Alert.alert(
        'Could not update this job',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  });
  const requestCancel = useSubmitGuard(async () => {
    Alert.alert('Cancel this job?', 'You will no longer be committed to this job.', [
      { text: 'Keep the job', style: 'cancel' },
      {
        text: 'Cancel job',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancel.mutateAsync({ jobId: jobId as string });
            } catch (error) {
              Alert.alert(
                'Could not cancel this job',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          })();
        },
      },
    ]);
  });

  const job = useMemo(() => (jobs ?? []).find((item) => item.id === jobId), [jobId, jobs]);

  if (isPending && !job) {
    return (
      <Screen edges={[]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  if (!job) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="briefcase-outline"
          title="Job not found"
          message="This job is no longer assigned to you, or it has finished."
        />
      </Screen>
    );
  }

  const price = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const paidLabel = job.status === JobStatus.PAID ? 'Amount paid' : 'Amount';
  const timelineIndex =
    job.status === JobStatus.PAID
      ? STAGES.length - 1
      : STAGES.findIndex((step) => step.status === job.status);
  const outcome = actionFor(job.status);

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <JobStatusBadge status={job.status} />
        <Text variant="titleLg" className="mt-3">
          {job.service.name}
        </Text>
        {job.description ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {job.description}
          </Text>
        ) : null}
      </View>

      <Card className="mt-6">
        <Text variant="label">Customer</Text>
        <Text variant="bodyLg" className="mt-1">
          {job.customer?.displayName ?? 'Customer'}
        </Text>
        {job.customer?.locationLabel ? (
          <Text variant="footnote" className="mt-0.5 text-text-secondary">
            {job.customer.locationLabel}
          </Text>
        ) : null}
        <Divider spaced />
        <View className="flex-row items-center justify-between">
          <Text variant="label">{paidLabel}</Text>
          <Text variant="title">{formatInr(price)}</Text>
        </View>
        {job.placeType === 'OTHER' && job.placeDescription ? (
          <>
            <Divider spaced />
            <Text variant="label">Place</Text>
            <Text variant="body" className="mt-1">
              {job.placeDescription}
            </Text>
          </>
        ) : null}
      </Card>

      <Text variant="title" className="mt-8">
        Progress
      </Text>

      <Card className="mt-3" padded={false}>
        {STAGES.map((step, index) => {
          const isReached = index <= timelineIndex;
          return (
            <View key={step.status}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center px-4 py-4">
                <View
                  className={
                    isReached
                      ? 'mr-3 h-2.5 w-2.5 rounded-full bg-success'
                      : 'mr-3 h-2.5 w-2.5 rounded-full bg-border-strong'
                  }
                />
                <Text
                  variant={isReached ? 'bodyStrong' : 'body'}
                  className={isReached ? undefined : 'text-text-secondary'}
                >
                  {step.label}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      {job.status === JobStatus.PAID ? (
        <Badge label={formatInr(price)} tone="success" className="mt-4" />
      ) : null}

      <View className="mt-8 gap-3">
        {outcome?.kind === 'transition' ? (
          <>
            <Button
              label={outcome.config.label}
              variant={outcome.config.variant}
              size="lg"
              loading={isSubmitting}
              onPress={() => void run(outcome.config.action)}
            />
            {canCancel(job.status) ? (
              <Button
                label="Cancel this job"
                variant="ghost"
                size="md"
                loading={requestCancel.isSubmitting}
                onPress={() => void requestCancel.run()}
              />
            ) : null}
          </>
        ) : outcome?.kind === 'notice' ? (
          <Button label={outcome.label} variant={outcome.variant} size="lg" disabled />
        ) : (
          <Text variant="caption" className="text-center text-text-muted">
            This job is closed.
          </Text>
        )}
      </View>
    </Screen>
  );
}