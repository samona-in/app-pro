import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View, type ViewToken } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { JobDetail } from '@samona/types';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Badge, Button, Card, Screen, Text } from '@/components/ui';
import { offerActions } from '@/services/offer-actions';
import {
  useIncomingOffersStore,
  offerDeadlineMs,
  offerRemainingFraction,
  type PendingOffer,
} from '@/stores/incoming-offers';
import { queryKeys } from '@/constants';
import { occupiedJobRoute } from '@/utils/job-routes';
import { messageForAcceptError } from '@/utils/job-errors';
import { formatDistanceMeters, formatInr, formatJobQuantity } from '@/utils/format';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import {
  useIncomingOfferDistances,
  type IncomingOfferWithDistance,
} from '@/hooks/use-incoming-offer-distances';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 46;
const RING_STROKE = 3;
const URGENT_THRESHOLD_MS = 20_000;

const VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 30 };

/**
 * The requested ordering: nearest offers first (by straight-line distance).
 * Amount is shown for comparison only and never affects the order.
 */
function nearestFirst(offers: IncomingOfferWithDistance[]): IncomingOfferWithDistance[] {
  const distance = (offer: PendingOffer) => offer.distanceMeters ?? Number.POSITIVE_INFINITY;
  return offers.sort((a, b) => distance(a) - distance(b));
}

/**
 * The combined incoming-job-offers tab.
 *
 * A free pro can be offered several jobs at once. This tab splits into a narrow
 * job selector on the left — one compact item per offer (a countdown ring drawn
 * around the ₹ amount, so offers can be compared by earning and remaining time
 * at a glance) — and a scrollable stack of content-height request cards on the
 * right, so any number of requests can be read side by side. Both sides stay
 * synchronized: tapping a sidebar item scrolls to that job's card, and
 * scrolling through the cards moves the sidebar highlight to the topmost
 * visible one.
 *
 * Performance: the screen subscribes only to the offer collection (and the
 * active/busy ids); the per-second store clock lives inside each ring/card
 * countdown, so ticking never redraws the whole screen. Accept is always the
 * atomic server-side claim: on success the whole pending collection (and every
 * native alert) is cleared and the pro is routed to the accepted job; on a
 * failed claim only that card is dropped — with a short "already taken" notice
 * — so the remaining offers stay actionable.
 */
export default function IncomingJobsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const offersWithDistance = useIncomingOfferDistances();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const offers = nearestFirst(offersWithDistance);

  // The highlighted job, derived from the selection: when the selected offer
  // is gone (accepted/declined/expired) the highlight falls back to the first
  // remaining one instead of pointing at a job that no longer exists.
  const activeJobId = useMemo(() => {
    const selected =
      selectedJobId !== null && offers.some((offer) => offer.jobId === selectedJobId);
    return selected ? selectedJobId : (offers[0]?.jobId ?? null);
  }, [selectedJobId, offers]);

  const listRef = useRef<FlatList<IncomingOfferWithDistance>>(null);
  // The last pager index we deliberately scrolled/highlighted to, so the
  // re-scroll effect below knows when a list reshuffle needs a scroll and
  // never fights a manual swipe.
  const activeIndexRef = useRef(-1);

  const scrollToIndex = useCallback((index: number) => {
    if (index < 0) return;
    try {
      listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true });
    } catch {
      // The item is not measured yet; `onScrollToIndexFailed` falls back and
      // retries once the list has laid out.
    }
  }, []);

  const focus = useCallback(
    (jobId: string) => {
      const index = offers.findIndex((offer) => offer.jobId === jobId);
      if (index < 0) return;
      activeIndexRef.current = index;
      setSelectedJobId(jobId);
      scrollToIndex(index);
    },
    [offers, scrollToIndex],
  );

  // When the active job's position in the list moves (an earlier offer expired)
  // or the highlight falls back to the first offer, scroll so the focused card
  // stays in view.
  const activeJobIndex = offers.findIndex((offer) => offer.jobId === activeJobId);
  useEffect(() => {
    if (activeJobIndex < 0) return;
    if (activeIndexRef.current === activeJobIndex) return;
    activeIndexRef.current = activeJobIndex;
    scrollToIndex(activeJobIndex);
  }, [activeJobIndex, scrollToIndex]);

  // The pager drives the highlight whenever the user swipes between cards.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<IncomingOfferWithDistance>[] }) => {
      const first = viewableItems.find(
        (token) => token.index !== null && token.index !== undefined,
      );
      if (!first) return;
      activeIndexRef.current = first.index ?? -1;
      const visible = first.item;
      if (visible) setSelectedJobId(visible.jobId);
    },
    [],
  );

  const handleAccept = useCallback(
    async (offer: PendingOffer): Promise<string | null> => {
      setBusyJobId(offer.jobId);
      try {
        const result = await offerActions.accept(offer.jobId);
        if (result.status !== 'done') {
          // A failed claim (taken / expired / offline) already dropped just
          // this offer; the screen stays open for the rest.
          return result.status === 'error' ? messageForAcceptError(result.error, t) : null;
        }
        // Refresh the assigned-jobs cache so the money-owed rule can route, then
        // land on the just-accepted job (or its payment screen when cash is owed).
        await queryClient.refetchQueries({ queryKey: queryKeys.jobs.all });
        const jobs = queryClient.getQueryData<JobDetail[]>(queryKeys.jobs.all) ?? [];
        const occupied = occupiedJobRoute(jobs);
        router.replace(occupied ?? `/job/${offer.jobId}/active`);
        return null;
      } finally {
        setBusyJobId(null);
      }
    },
    [queryClient, t],
  );

  const handleDecline = useCallback(
    async (offer: PendingOffer): Promise<string | null> => {
      setBusyJobId(offer.jobId);
      try {
        const result = await offerActions.decline(offer.jobId);
        if (result.status === 'error') return t('incomingJobs.declineError');
        return null;
      } finally {
        setBusyJobId(null);
      }
    },
    [t],
  );

  return (
    <Screen edges={['top']} padded={false}>
      <View className="border-b border-border px-5 pb-2 pt-2">
        <Text variant="titleLg">{t('incomingJobs.count', { count: offers.length })}</Text>
      </View>

      <View className="flex-1 flex-row">
        {/* Job selector: one compact ring + amount per offer. */}
        <View className="w-20 border-r border-border">
          <FlatList
            data={offers}
            extraData={activeJobId}
            keyExtractor={(offer) => offer.jobId}
            showsVerticalScrollIndicator={false}
            contentContainerClassName="pb-4 pt-2"
            renderItem={({ item }) => (
              <SidebarItem offer={item} active={item.jobId === activeJobId} onPress={focus} />
            )}
          />
        </View>

        {/* Request cards: content-height stack, so any number fit on screen. */}
        <View className="flex-1 bg-surface-muted">
          <FlatList
            ref={listRef}
            data={offers}
            extraData={busyJobId}
            keyExtractor={(offer) => offer.jobId}
            showsVerticalScrollIndicator={false}
            contentContainerClassName="pb-4"
            windowSize={3}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY_CONFIG}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              const offset = index * (averageItemLength || 320);
              listRef.current?.scrollToOffset({ offset, animated: false });
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true });
              }, 100);
            }}
            renderItem={({ item }) => (
              <FocusedJobCard
                offer={item}
                busy={busyJobId === item.jobId}
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            )}
          />
        </View>
      </View>
    </Screen>
  );
}

function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Countdown ring drawn around a label (the ₹ amount). The progress fraction is
 * driven by the store's 1s clock (the same source of truth that prunes expired
 * offers); between ticks the arc drains smoothly via a 1s linear animation, so
 * only this tiny component ever re-renders on each second.
 */
function CountdownRing({
  progress,
  label,
  size = RING_SIZE,
  stroke = RING_STROKE,
  ringColor,
}: {
  progress: number;
  label: string;
  size?: number;
  stroke?: number;
  ringColor: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressValue = useSharedValue(progress);

  useEffect(() => {
    progressValue.value = withTiming(progress, { duration: 1_000, easing: Easing.linear });
  }, [progress, progressValue]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progressValue.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color.border}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          animatedProps={ringProps}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          className="px-1"
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const SidebarItem = memo(function SidebarItem({
  offer,
  active,
  onPress,
}: {
  offer: PendingOffer;
  active: boolean;
  onPress: (jobId: string) => void;
}) {
  const { t } = useTranslation();
  const now = useIncomingOffersStore((state) => state.now);
  const amount = formatInr(offer.amountPaise);
  const deadline = offerDeadlineMs(offer);
  const remaining = deadline !== null ? Math.max(0, deadline - now) : null;
  const urgent = remaining !== null && remaining > 0 && remaining <= URGENT_THRESHOLD_MS;
  const expired = remaining === 0;
  const ringColor = expired ? color.danger : urgent ? color.warning : color.brand;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('incomingJobs.amountA11y', { amount })}
      accessibilityState={{ selected: active }}
      onPress={() => onPress(offer.jobId)}
      className={cn(
        'min-h-[68px] items-center justify-center border-l-[3px] py-2',
        active ? 'border-brand bg-brand-soft' : 'border-transparent',
      )}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      {deadline !== null ? (
        <CountdownRing
          progress={offerRemainingFraction(offer, now) ?? 0}
          label={amount}
          ringColor={ringColor}
        />
      ) : (
        <View
          style={{ width: RING_SIZE, height: RING_SIZE }}
          className="items-center justify-center"
        >
          <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {amount}
          </Text>
        </View>
      )}
      {remaining !== null ? (
        <Text
          variant="caption"
          className={cn(
            'mt-1 font-semibold',
            expired ? 'text-danger' : urgent ? 'text-warning' : 'text-text-muted',
          )}
        >
          {formatClock(remaining)}
        </Text>
      ) : null}
    </Pressable>
  );
});

const FocusedJobCard = memo(function FocusedJobCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: IncomingOfferWithDistance;
  busy: boolean;
  onAccept: (offer: PendingOffer) => Promise<string | null>;
  onDecline: (offer: PendingOffer) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const now = useIncomingOffersStore((state) => state.now);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  const amountPaise = offer.amountPaise;
  const quantityLabel = formatJobQuantity(offer);
  const distanceLabel =
    formatDistanceMeters(offer.distanceMeters) ??
    t(
      offer.distanceStatus === 'loading'
        ? 'incomingJobs.calculatingDistance'
        : 'incomingJobs.distanceUnavailable',
    );
  const deadline = offerDeadlineMs(offer);
  const remaining = deadline !== null ? Math.max(0, deadline - now) : null;
  const urgent = remaining !== null && remaining > 0 && remaining <= URGENT_THRESHOLD_MS;
  const category = offer.serviceCategory || offer.serviceName;

  return (
    <View className="px-3 pt-1.5 pb-3">
      <Card className="border border-border" padded={false}>
        <View className="p-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text variant="label" className="text-text-secondary">
                {offer.serviceName || t('incomingJobs.titleFallback')}
              </Text>
              {category ? (
                <Text variant="title" className="mt-0.5">
                  {category}
                </Text>
              ) : null}
            </View>
            {amountPaise !== null ? (
              <View className="items-end">
                <Text variant="metric" className="text-success">
                  {formatInr(amountPaise)}
                </Text>
                {quantityLabel ? (
                  <Text variant="caption" className="text-text-muted">
                    {quantityLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text variant="body" className="mt-1 text-text-muted">
            {distanceLabel}
          </Text>

          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            {remaining !== null ? (
              <Badge
                label={
                  remaining === 0
                    ? t('jobStatus.expired')
                    : t('incomingJobs.expiresIn', { time: formatClock(remaining) })
                }
                tone={remaining === 0 ? 'danger' : urgent ? 'warning' : 'neutral'}
              />
            ) : null}
          </View>

          {offer.address ? (
            <Text variant="body" className="mt-2 text-text-secondary">
              {offer.address}
            </Text>
          ) : null}

          {error ? (
            <Text variant="caption" className="mt-3 text-danger">
              {error}
            </Text>
          ) : null}

          <View className="mt-4 flex-row gap-3">
            <Button
              variant="secondary"
              label={t('incomingJobs.decline')}
              size="md"
              className="flex-1"
              disabled={busy}
              onPress={() => {
                void onDecline(offer).then((message) => setError(message));
              }}
            />
            <Button
              variant="success"
              label={t('incomingJobs.accept')}
              size="md"
              className="flex-1"
              loading={busy}
              onPress={() => {
                void onAccept(offer).then((message) => setError(message));
              }}
            />
          </View>
        </View>
      </Card>
    </View>
  );
});
