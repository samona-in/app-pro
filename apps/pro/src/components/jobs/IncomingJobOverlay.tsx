import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { JobStatus } from '@samona/types';
import type { AvailableJob, JobDetail } from '@samona/types';
import { Badge, Card, Text } from '@/components/ui';
import { useAcceptJob, useSubmitGuard } from '@/hooks';
import type { IncomingJobResolution } from '@/stores/incoming-job';
import { api } from '@/services/api';
import { stopJobAlert } from '@/services/job-alert';
import { jobNotificationService } from '@/services/job-notifications';
import { color } from '@/theme';
import { formatDistance, formatEta, formatInr, formatRelativeTime } from '@/utils/format';

const RESOLUTION_FEEDBACK: Record<
  IncomingJobResolution,
  { title: string; message: string; tone: 'success' | 'danger' | 'neutral' }
> = {
  accept: { title: 'Job accepted', message: 'Get ready — stay safe on the way.', tone: 'success' },
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

/** How long the pro has to decide before the request is treated as expired. */
export const JOB_ALERT_COUNTDOWN_MS = 16_000;

/** How long the resolution confirmation stays on screen before advancing/dismissing. */
const RESOLUTION_HOLD_MS = 2_500;

/** How often to re-validate the job status while the overlay is open (ms). */
const JOB_VALIDATION_INTERVAL_MS = 8_000;

/** Radius of the circular reject ring, in SVG units. */
const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface IncomingJobOverlayProps {
  job: AvailableJob;
  resolution: IncomingJobResolution | null;
  queueCount: number;
  onResolve: (resolution: IncomingJobResolution) => void;
  onAdvance: () => void;
  onDismiss: () => void;
}

/**
 * The Rapido-style request alert shown the moment a new job lands. A 16-second
 * countdown ticks around the circular reject button; when it reaches zero the
 * request silently closes and the overlay advances to the next queued job (or
 * dismisses). The ring is a client-side decision window only — the server
 * auto-expires unaccepted jobs on its own longer TTL, so nothing here labels a
 * request "expired".
 *
 * When multiple jobs are queued, a badge shows how many are waiting. After the
 * resolution hold, the overlay advances to the next job or dismisses.
 *
 * The modal cannot be dismissed by tapping outside — the backdrop consumes
 * touches. It only closes via explicit actions (Accept / Reject) or automatic
 * resolution (timeout, cancellation, job unavailable).
 */
export function IncomingJobOverlay({
  job,
  resolution,
  queueCount,
  onResolve,
  onAdvance,
  onDismiss,
}: IncomingJobOverlayProps) {
  const accept = useAcceptJob();
  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(JOB_ALERT_COUNTDOWN_MS / 1000));

  const { run: runAccept, isSubmitting } = useSubmitGuard(async () => {
    stopJobAlert();
    jobNotificationService.setAccepting(jobRef.current.id);
    try {
      await accept.mutateAsync(jobRef.current.id);
      onResolve('accept');
    } catch {
      onResolve('unavailable');
    } finally {
      jobNotificationService.setAccepting(null);
    }
  });
  const { run: runReject } = useSubmitGuard(() => {
    stopJobAlert();
    // The pro deliberately declined, so no "declined" confirmation screen — just
    // close the alert and move to the next queued job, if any.
    if (queueCount > 0) onAdvance();
    else onDismiss();
  });

  // 16-second countdown around the reject ring. Reaching zero silently closes
  // the request.
  useEffect(() => {
    if (resolution) return;
    const interval = setInterval(() => {
      setSecondsLeft((secs) => Math.max(secs - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resolution]);

  // Fired once the ring hits zero: close the request without an "expired"
  // screen — the job is still open server-side (the server owns real expiry), so
  // the ring just closes the alert and moves to the next queued job, if any.
  // Kept out of the `setSecondsLeft` updater so the store update never happens
  // mid-render.
  useEffect(() => {
    if (resolution || secondsLeft > 0) return;
    if (queueCount > 0) onAdvance();
    else onDismiss();
  }, [secondsLeft, resolution, queueCount, onAdvance, onDismiss]);

  // Validate job status on mount and periodically while open.
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
        // Network error: keep the overlay open, retry on the next interval.
      }
    }

    validateJob();
    const interval = setInterval(validateJob, JOB_VALIDATION_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [resolution, onResolve]);

  // Once resolved, hold the confirmation briefly, then advance to the next
  // job or dismiss if the queue is empty.
  useEffect(() => {
    if (!resolution) return;
    const timer = setTimeout(queueCount > 0 ? onAdvance : onDismiss, RESOLUTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [resolution, queueCount, onAdvance, onDismiss]);

  // Progress around the ring: 1 (full) -> 0 as the countdown elapses.
  const progress = useMemo(
    () => secondsLeft / (JOB_ALERT_COUNTDOWN_MS / 1000),
    [secondsLeft],
  );

  const feedback = resolution ? RESOLUTION_FEEDBACK[resolution] : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void runReject()}>
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
          {queueCount > 0 && (
            <View className="mt-4 rounded-full bg-surface-muted px-4 py-2">
              <Text variant="caption" className="text-text-muted">
                {queueCount} more {queueCount === 1 ? 'request' : 'requests'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View className="flex-1">
          <Pressable className="flex-1 bg-surface-inverse/70" onPress={() => {}} />
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
            ) : (
              <Text variant="footnote" className="mt-0.5 text-text-secondary">
                {job.service.name} · {job.skill.name}
              </Text>
            )}

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

            {queueCount > 0 && (
              <View className="mt-4 flex-row items-center justify-center rounded-full bg-surface-muted px-4 py-2">
                <Ionicons name="layers-outline" size={14} color={color['text-secondary']} />
                <Text variant="caption" className="ml-1 text-text-secondary">
                  {queueCount} more {queueCount === 1 ? 'request' : 'requests'}
                </Text>
              </View>
            )}

            <View className="mt-6 flex-row items-center justify-between">
              {/* Reject: circular button with a red countdown ring around it. */}
              <View className="flex-row items-center gap-3">
                <View className="relative">
                  <Svg width={72} height={72} viewBox="0 0 72 72">
                    <Circle
                      cx={36}
                      cy={36}
                      r={RING_RADIUS}
                      stroke={color.danger}
                      strokeWidth={5}
                      fill="none"
                      strokeOpacity={0.25}
                    />
                    <Circle
                      cx={36}
                      cy={36}
                      r={RING_RADIUS}
                      stroke={color.danger}
                      strokeWidth={5}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                      transform="rotate(-90 36 36)"
                    />
                  </Svg>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reject request"
                    onPress={() => void runReject()}
                    className="absolute inset-0 items-center justify-center"
                  >
                    <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-danger bg-surface">
                      <Text variant="title" className="font-bold text-danger" style={{ marginTop: -3 }}>
                        −
                      </Text>
                    </View>
                  </Pressable>
                </View>
                <Text variant="caption" className="text-text-secondary">
                  {secondsLeft}s
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept request"
                onPress={() => void runAccept()}
                className="h-16 px-10 items-center justify-center rounded-full bg-success"
              >
                {isSubmitting ? (
                  <Text variant="bodyStrong" className="text-text-inverse">
                    Accepting…
                  </Text>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <Text variant="bodyStrong" className="text-text-inverse">
                      Accept
                    </Text>
                    <Ionicons name="checkmark" size={20} color={color['text-inverse']} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}
