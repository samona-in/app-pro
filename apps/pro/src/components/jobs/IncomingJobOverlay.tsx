import { useEffect, useRef } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { JobStatus } from '@samona/types';
import type { AvailableJob, JobDetail } from '@samona/types';
import { Badge, Button, Card, Text } from '@/components/ui';
import { useAcceptJob, useSubmitGuard } from '@/hooks';
import type { IncomingJobResolution } from '@/stores/incoming-job';
import { api } from '@/services/api';
import { color } from '@/theme';
import { formatDistance, formatEta, formatInr, formatRelativeTime } from '@/utils/format';

const RESOLUTION_FEEDBACK: Record<
  IncomingJobResolution,
  { title: string; message: string; tone: 'success' | 'danger' | 'neutral' }
> = {
  accept: { title: 'Job accepted', message: 'Get ready — stay safe on the way.', tone: 'success' },
  reject: {
    title: 'Request declined',
    message: 'Another request may arrive shortly.',
    tone: 'neutral',
  },
  expired: {
    title: 'Request expired',
    message: 'This request was not claimed in time.',
    tone: 'neutral',
  },
  cancelled: {
    title: 'Request cancelled',
    message: 'The customer cancelled this request.',
    tone: 'neutral',
  },
  unavailable: {
    title: 'Request no longer available',
    message: 'This job was claimed by another professional.',
    tone: 'neutral',
  },
};

const UNAVAILABLE_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
  JobStatus.PAID,
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
]);

/** How long the resolution confirmation stays on screen before the overlay closes. */
const RESOLUTION_HOLD_MS = 3_000;

/** How often to re-validate the job status while the overlay is open (ms). */
const JOB_VALIDATION_INTERVAL_MS = 10_000;

export interface IncomingJobOverlayProps {
  job: AvailableJob;
  resolution: IncomingJobResolution | null;
  onResolve: (resolution: IncomingJobResolution) => void;
  onDismiss: () => void;
}

/**
 * The Rapido-Captain-style full-screen request alert shown the moment a new job
 * lands. Owns no audio itself — `useJobAlert` keeps the looping beep in step
 * with this overlay's lifetime (accept / reject / expire / cancel all stop it).
 *
 * Validates job status on mount and periodically while open to handle cases
 * where the job becomes unavailable (accepted by another pro, cancelled, expired)
 * between the push/socket event and user action.
 *
 * The modal cannot be dismissed by tapping outside — the backdrop consumes
 * touches. The alert only closes via explicit actions: Accept, Reject, or
 * automatic resolution (expiry, cancellation, job unavailable).
 */
export function IncomingJobOverlay({ job, resolution, onResolve, onDismiss }: IncomingJobOverlayProps) {
  const accept = useAcceptJob();
  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  const { run: runAccept, isSubmitting } = useSubmitGuard(async () => {
    try {
      await accept.mutateAsync(jobRef.current.id);
      onResolve('accept');
    } catch {
      onResolve('unavailable');
    }
  });
  const { run: runReject } = useSubmitGuard(() => onResolve('reject'));

  // Validate job status on mount and periodically while overlay is open.
  // This catches cases where the job was taken by another pro, cancelled, or
  // expired after the initial push/socket event but before the user acted.
  useEffect(() => {
    if (resolution) return;

    let mounted = true;

    async function validateJob(): Promise<void> {
      if (!mounted) return;
      try {
        const latest = await api.get<JobDetail>(`/jobs/${jobRef.current.id}`);
        if (!mounted) return;
        if (UNAVAILABLE_STATUSES.has(latest.status)) {
          onResolve(latest.status === JobStatus.CANCELLED ? 'cancelled' : 'unavailable');
        }
      } catch {
        // Network error: keep the overlay open, retry on next interval
      }
    }

    // Initial validation
    validateJob();

    // Periodic validation
    const interval = setInterval(validateJob, JOB_VALIDATION_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [resolution, onResolve]);

  // Once resolved, hold the confirmation briefly, then dismiss the overlay. No
  // local state is needed — the store's `resolution` is the display source.
  useEffect(() => {
    if (!resolution) return;
    const timer = setTimeout(onDismiss, RESOLUTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [resolution, onDismiss]);

  const feedback = resolution ? RESOLUTION_FEEDBACK[resolution] : null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => void runReject()}
    >
      <StatusBar style="light" />
      {feedback ? (
        <View className="flex-1 items-center justify-center bg-surface-inverse/95 px-6">
          <View
            className={`h-20 w-20 items-center justify-center rounded-full ${
              feedback.tone === 'success' ? 'bg-success/20' : 'bg-surface-muted'
            }`}
          >
            <Ionicons
              name={feedback.tone === 'success' ? 'checkmark-circle' : 'information-circle'}
              size={44}
              color={feedback.tone === 'success' ? color.success : color['text-inverse']}
            />
          </View>
          <Text variant="titleLg" className="mt-6 text-center text-text-inverse">
            {feedback.title}
          </Text>
          <Text variant="body" className="mt-2 text-center text-text-muted">
            {feedback.message}
          </Text>
        </View>
      ) : (
        // Backdrop that consumes touches — tapping outside does nothing.
        // The inner Pressable on the card handles the Reject action.
        <View className="flex-1">
          <Pressable className="flex-1" onPress={() => {}} />
          <Pressable
            className="flex-1 justify-end"
            onPress={() => void runReject()}
          >
            <View className="rounded-t-3xl bg-surface p-6 pb-10">
              <View className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border-strong" />

              <View className="flex-row items-center justify-between">
                <Badge label="New job request" tone="danger" withDot />
                <Text variant="caption" className="text-text-muted">
                  {formatRelativeTime(job.createdAt)}
                </Text>
              </View>

              <Text variant="titleLg" className="mt-4">
                {job.service.name}
              </Text>
              {job.customSkill ? (
                <Text variant="footnote" className="mt-0.5 text-text-secondary">
                  {job.customSkill}
                </Text>
              ) : null}

              <Text variant="display" className="mt-4">
                {formatInr(job.basePayPaise)}
              </Text>

              <View className="mt-4 flex-row items-center gap-4">
                <View className="flex-row items-center gap-1">
                  <Ionicons name="navigate-outline" size={14} color={color['text-muted']} />
                  <Text variant="caption" className="text-text-secondary">
                    {formatDistance(job.distanceKm)} · {formatEta(job.estimatedEtaMinutes)}
                  </Text>
                </View>
                {job.placeType === 'OTHER' && job.placeDescription ? (
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={14} color={color['text-muted']} />
                    <Text variant="caption" className="text-text-secondary" numberOfLines={1}>
                      {job.placeDescription}
                    </Text>
                  </View>
                ) : null}
              </View>

              {job.description ? (
                <Card className="mt-4 bg-surface-muted" padded={false}>
                  <Text variant="body" className="px-4 py-3 text-text-secondary" numberOfLines={3}>
                    {job.description}
                  </Text>
                </Card>
              ) : null}

              <View className="mt-6 flex-row gap-3">
                <Button
                  label="Reject"
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onPress={() => void runReject()}
                />
                <Button
                  label="Accept"
                  variant="success"
                  size="lg"
                  loading={isSubmitting}
                  className="flex-1"
                  onPress={() => void runAccept()}
                />
              </View>
            </View>
          </Pressable>
        </View>
      )}
    </Modal>
  );
}