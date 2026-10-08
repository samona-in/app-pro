import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { openURL } from 'expo-linking';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  useBottomSheet,
  useBottomSheetSpringConfigs,
  type BottomSheetHandleProps,
} from '@gorhom/bottom-sheet';
import type { JobDetail } from '@samona/types';
import { Avatar, Text } from '@/components/ui';
import { ServiceImage } from '@/components/home/ServiceImage';
import { useActiveOrders } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { jobStatusHint, proDisplayName } from './active-job-copy';

/** The collapsed hint strip. Compact: grab handle + one 44pt touch row. */
const HINT_HEIGHT = 72;
/** How far the expanded sheet rises, as a share of the scene above the bar. */
const EXPANDED_SCENE_RATIO = 0.62;
/** Corner radius of the sheet's top edge, matching the theme's premium feel. */
const TOP_RADIUS = 24;

/** Small rotating search glyph shown while matching is still running. */
function FindingSpinner() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="search" size={13} color={color.brand} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /**
   * Anchors the sheet to the scene above the bottom tab bar. The `bottom`
   * inset is supplied by the tabs layout: measured tab-bar height + gap.
   */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  background: {
    flex: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  /** The collapsed hint card: solid white, shadow cast only above (no bottom bleed). */
  handle: {
    height: HINT_HEIGHT,
    backgroundColor: color.surface,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    boxShadow: '0px -16px 12px rgba(15, 23, 42, 0.12)',
  },
  content: { backgroundColor: color.surface },
});

function SheetBackground() {
  return <View style={styles.background} />;
}

interface HintHandleProps extends BottomSheetHandleProps {
  job: JobDetail;
  /** True when the primary order is not the only active order. */
  hasMore: boolean;
  /** Number of additional active orders beyond the primary (for the chip). */
  extraCount: number;
}

/**
 * The collapsed hint card. Shows the pro name • service and a short stage
 * word; Message + Call act on the order. With a single active order the card
 * opens the booking details; with several it springs the order-list sheet open.
 */
function HintHandle({ job, hasMore, extraCount }: HintHandleProps) {
  const { snapToIndex } = useBottomSheet();
  const copy = jobStatusHint(job);

  const onPress = useCallback(() => {
    if (hasMore) {
      snapToIndex(1);
      return;
    }
    router.push(`/booking/${job.id}`);
  }, [hasMore, job.id, snapToIndex]);

  const openChat = useCallback(() => {
    router.push({ pathname: '/booking/[id]/chat', params: { id: job.id } });
  }, [job.id]);

  const callPro = useCallback(() => {
    const phone = job.pro?.phone;
    if (!phone) return;
    void openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Could not start the call', 'No app on this device can place calls.');
    });
  }, [job.pro?.phone]);

  return (
    <View style={styles.handle} className="justify-center overflow-hidden">
      <View className="items-center pb-1">
        <View className="h-1 w-9 rounded-full bg-border-strong" />
      </View>
      <View className="flex-row items-center px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.title} — ${copy.stage}`}
          accessibilityHint={
            hasMore ? 'Opens a list of your active orders' : 'Opens the details of this booking'
          }
          onPress={onPress}
          className="flex-1 flex-row items-center"
        >
          {job.pro ? (
            <Avatar name={proDisplayName(job.pro)} uri={job.pro.photoUrl} size="md" />
          ) : (
            <ServiceImage
              uri={job.service.icon}
              accessibilityLabel={job.service.name}
              className="h-11 w-11 rounded-xl"
            />
          )}
          <View className="ml-3 flex-1 pr-2">
            <View className="flex-row items-center">
              {copy.finding ? <FindingSpinner /> : null}
              <Text
                variant="bodyStrong"
                numberOfLines={1}
                className={cn('shrink', copy.finding && 'ml-1.5')}
              >
                {copy.title}
              </Text>
            </View>
            <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-secondary">
              {copy.stage}
            </Text>
          </View>
        </Pressable>

        {hasMore ? (
          <View className="ml-2 rounded-full bg-surface-muted px-2 py-1">
            <Text variant="caption">
              +{extraCount} {extraCount === 1 ? 'more' : 'more'}
            </Text>
          </View>
        ) : null}

        {job.pro ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Message your professional"
            onPress={openChat}
            hitSlop={8}
            className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
          >
            <Ionicons name="chatbubble-ellipses" size={16} color={color['text-primary']} />
          </Pressable>
        ) : null}

        {job.pro?.phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call your professional"
            onPress={callPro}
            hitSlop={8}
            className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
          >
            <Ionicons name="call" size={16} color={color['text-primary']} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function OrderRow({ job }: { job: JobDetail }) {
  const copy = jobStatusHint(job);

  const openJob = useCallback(() => {
    router.push(`/booking/${job.id}`);
  }, [job.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.title} — ${copy.stage}`}
      onPress={openJob}
      className="flex-row items-center rounded-xl border border-border p-3"
    >
      {job.pro ? (
        <Avatar name={proDisplayName(job.pro)} uri={job.pro.photoUrl} size="md" />
      ) : (
        <ServiceImage
          uri={job.service.icon}
          accessibilityLabel={job.service.name}
          className="h-10 w-10 rounded-xl"
        />
      )}
      <View className="ml-3 flex-1 pr-2">
        <View className="flex-row items-center">
          {copy.finding ? <FindingSpinner /> : null}
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            className={cn('shrink', copy.finding && 'ml-1.5')}
          >
            {copy.title}
          </Text>
        </View>
        <Text variant="caption" numberOfLines={1} className="mt-0.5 text-text-secondary">
          {copy.stage}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
    </Pressable>
  );
}

/**
 * The customer's live active-order hint, docked directly above the bottom tab
 * bar so the bar stays visible and clickable.
 *
 * `bottomOffset` is the measured tab-bar height plus the safe-area gap and is
 * provided by `(tabs)/_layout.tsx`. With one active order the hint is a plain
 * card that opens the booking details; with several it springs open a list of
 * every active order. Everything un-mounts when no order is live.
 */
export function ActiveJobHint({ bottomOffset }: { bottomOffset: number }) {
  const orders = useActiveOrders();

  if (orders.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { bottom: bottomOffset }]}>
      <ActiveJobSheet orders={orders} bottomOffset={bottomOffset} />
    </View>
  );
}

function ActiveJobSheet({ orders, bottomOffset }: { orders: JobDetail[]; bottomOffset: number }) {
  const { height: windowHeight } = useWindowDimensions();
  const primary = orders[0]!;
  const hasMore = orders.length > 1;
  const sceneHeight = Math.max(0, windowHeight - bottomOffset);

  const snapPoints = useMemo(() => {
    if (!hasMore) return [HINT_HEIGHT] as number[];
    const expanded = Math.min(
      Math.round(sceneHeight * EXPANDED_SCENE_RATIO),
      Math.max(HINT_HEIGHT + 8, sceneHeight - 120),
    );
    return [HINT_HEIGHT, Math.max(HINT_HEIGHT + 8, expanded)] as number[];
  }, [hasMore, sceneHeight]);

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  const lastIndex = useRef(0);
  const handleChange = useCallback((index: number) => {
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    void Haptics.impactAsync(
      index > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
  }, []);

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableOverDrag={false}
      enablePanDownToClose={false}
      enableDynamicSizing={false}
      animationConfigs={springConfig}
      backgroundComponent={SheetBackground}
      handleComponent={(props) => (
        <HintHandle {...props} job={primary} hasMore={hasMore} extraCount={orders.length - 1} />
      )}
      backdropComponent={
        hasMore
          ? (props) => (
              <BottomSheetBackdrop
                {...props}
                appearsOnIndex={1}
                disappearsOnIndex={0}
                pressBehavior="collapse"
                opacity={0.35}
              />
            )
          : undefined
      }
      onChange={handleChange}
    >
      {hasMore ? (
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          style={styles.content}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <Text variant="title" className="mb-3 pt-1">
            Your active orders
          </Text>
          <View className="gap-2">
            {orders.map((order) => (
              <OrderRow key={order.id} job={order} />
            ))}
          </View>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}
