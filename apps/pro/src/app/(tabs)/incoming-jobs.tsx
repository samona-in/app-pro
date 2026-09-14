import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@samona/api-client';
import type { JobDetail } from '@samona/types';
import { Badge, Button, Card, Screen, Text } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import { clearNativeJobAlert } from '@/services/overlay-alert';
import { jobsApi } from '@/services/jobs';
import {
  useIncomingOffersStore,
  offerDeadlineMs,
  type PendingOffer,
} from '@/stores/incoming-offers';
import { queryKeys } from '@/constants';
import { useAcceptJob } from '@/hooks';
import { occupiedJobRoute } from '@/utils/job-routes';
import { formatInr } from '@/utils/format';

/**
 * The combined incoming-job-offers tab.
 *
 * A free pro can be offered several jobs at once; this tab shows every valid
 * pending offer as one scrollable, comparable list — earnings and distance big
 * and scannable, per-offer expiry countdowns, and a direct Accept per card. It
 * is reached through the bottom "Requests" tab (badged with the live pending
 * count), the auto-present on an incoming offer, the native alert entry point,
 * or the home banner.
 *
 * Accept is always the atomic server-side claim: on success the whole pending
 * collection (and every native alert) is cleared and the pro is routed to the
 * accepted job; on a failed claim only that card is dropped — with a short
 * "already taken" notice — so the remaining offers stay actionable.
 */
export default function IncomingJobsScreen() {
  const queryClient = useQueryClient();
  const acceptMutation = useAcceptJob();

  const offersById = useIncomingOffersStore((state) => state.offersById);
  const now = useIncomingOffersStore((state) => state.now);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const offers = useMemo(() => {
    const distance = (offer: PendingOffer) => offer.distanceMeters ?? Number.POSITIVE_INFINITY;
    return Object.values(offersById).sort((a, b) => distance(a) - distance(b));
  }, [offersById]);

  async function handleAccept(offer: PendingOffer): Promise<string | null> {
    setBusyJobId(offer.jobId);
    try {
      await acceptMutation.mutateAsync(offer.jobId);
      const store = useIncomingOffersStore.getState();
      const cleared = Object.keys(store.offersById);
      store.clearAll();
      for (const jobId of cleared) void clearNativeJobAlert(jobId);
      // Refresh the assigned-jobs cache so the money-owed rule can route, then
      // land on the just-accepted job (or its payment screen when cash is owed).
      await queryClient.refetchQueries({ queryKey: queryKeys.jobs.all });
      const jobs = queryClient.getQueryData<JobDetail[]>(queryKeys.jobs.all) ?? [];
      const occupied = occupiedJobRoute(jobs);
      router.replace(occupied ?? `/job/${offer.jobId}/active`);
      return null;
    } catch (error) {
      // The claim failed (taken by another pro, expired, offline): only this
      // offer is lost, the screen stays open for the rest.
      useIncomingOffersStore.getState().remove(offer.jobId);
      void clearNativeJobAlert(offer.jobId);
      return messageForAcceptError(error);
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleDecline(offer: PendingOffer) {
    setBusyJobId(offer.jobId);
    try {
      await jobsApi.decline(offer.jobId);
    } catch {
      // Declining is idempotent server-side; leaving the offer is the goal.
    }
    useIncomingOffersStore.getState().remove(offer.jobId);
    void clearNativeJobAlert(offer.jobId);
    setBusyJobId(null);
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View className="px-5 pb-2 pt-2">
        <Text variant="titleLg">
          {offers.length === 1 ? '1 job' : `${offers.length} jobs`}
        </Text>
      </View>

      <FlatList
        data={offers}
        keyExtractor={(offer) => offer.jobId}
        contentContainerClassName="px-5 pb-8"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          <EmptyState
            icon="file-tray-outline"
            title="No requests right now"
            message="New job requests appear here the moment they land. Keep the app open and alerts on to stay first in line."
          />
        }
        renderItem={({ item }) => (
          <OfferCard
            offer={item}
            now={now}
            busy={busyJobId === item.jobId}
            onAccept={async (offer) => {
              const message = await handleAccept(offer);
              return message;
            }}
            onDecline={(offer) => void handleDecline(offer)}
          />
        )}
      />
    </Screen>
  );
}

function messageForAcceptError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 409) return 'Job already taken';
    if (error.status === 404) return 'This request is no longer available';
    if (error.status === 429) return "You're moving fast — try again in a moment.";
  }
  return "Couldn't accept. Check your connection.";
}

function formatOfferDistance(meters: number | null): string | null {
  if (meters === null) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Expires in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function OfferCard({
  offer,
  now,
  busy,
  onAccept,
  onDecline,
}: {
  offer: PendingOffer;
  now: number;
  busy: boolean;
  onAccept: (offer: PendingOffer) => Promise<string | null>;
  onDecline: (offer: PendingOffer) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const amountPaise = offer.amountPaise;
  const distanceLabel = formatOfferDistance(offer.distanceMeters);
  const deadline = offerDeadlineMs(offer);
  const remaining = deadline !== null ? Math.max(0, deadline - now) : null;
  const urgent = remaining !== null && remaining <= 20_000 && remaining > 0;
  const category = offer.serviceCategory || offer.serviceName;

  return (
    <Card className="p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text variant="label" className="text-text-secondary">
            {offer.serviceName || 'New job request'}
          </Text>
          {category ? (
            <Text variant="bodyStrong" className="mt-0.5">
              {category}
            </Text>
          ) : null}
        </View>
        {amountPaise !== null ? (
          <Text variant="titleLg" className="text-success">
            {formatInr(Math.round(amountPaise / 100))}
          </Text>
        ) : null}
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        {distanceLabel ? <Badge label={distanceLabel} tone="info" /> : null}
        {remaining !== null ? (
          <Badge
            label={remaining === 0 ? 'Expired' : formatCountdown(remaining)}
            tone={remaining === 0 ? 'danger' : urgent ? 'warning' : 'neutral'}
          />
        ) : null}
      </View>

      {offer.address ? (
        <Text variant="footnote" className="mt-2 text-text-secondary">
          {offer.address}
        </Text>
      ) : null}

      {error ? (
        <Text variant="caption" className="mt-2 text-danger">
          {error}
        </Text>
      ) : null}

      <View className="mt-4 flex-row gap-3">
        <Button
          variant="secondary"
          label="Decline"
          size="sm"
          className="flex-1"
          disabled={busy}
          onPress={() => onDecline(offer)}
        />
        <Button
          variant="success"
          label="Accept"
          size="sm"
          className="flex-1"
          loading={busy}
          onPress={() => {
            void onAccept(offer).then((message) => setError(message));
          }}
        />
      </View>
    </Card>
  );
}