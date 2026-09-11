import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { openURL } from 'expo-linking';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
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
import { JobStatus, type JobDetail } from '@samona/types';
import { Avatar, Badge, Button, Text, type BadgeTone } from '@/components/ui';
import { ServiceImage } from '@/components/home/ServiceImage';
import { useActiveJob } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRupees } from '@/utils/format';
import { bookingStatusLabel } from './BookingCard';
import {
  ACTIVE_JOB_STAGES,
  activeJobStageIndex,
  jobStatusHint,
} from './active-job-copy';

/** The collapsed hint strip. Compact: grab handle + one 44pt touch row. */
const HINT_HEIGHT = 72;
/** How far the expanded sheet rises, as a share of the scene above the bar. */
const EXPANDED_SCENE_RATIO = 0.62;
/** Corner radius of the sheet's top edge, matching the theme's premium feel. */
const TOP_RADIUS = 24;

function statusTone(status: JobStatus): BadgeTone {
  switch (status) {
    case JobStatus.REQUESTED:
    case JobStatus.OFFERED:
      return 'warning';
    case JobStatus.COMPLETED:
    case JobStatus.PAYMENT_PENDING:
      return 'success';
    default:
      return 'info';
  }
}

/** Small rotating search glyph shown while matching is still running. */
function FindingSpinner() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
    );
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
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  content: { backgroundColor: color.surface },
});

function SheetBackground() {
  return <View style={styles.background} />;
}

interface HintHandleProps extends BottomSheetHandleProps {
  job: JobDetail;
  expanded: boolean;
}

/**
 * The collapsed hint: drag handle, service tile, status headline + short
 * description and a chevron that flips as the sheet opens. Tapping the hint
 * opens the booking details; the chevron (or dragging up) expands the sheet.
 */
function HintHandle({ job, expanded, animatedIndex }: HintHandleProps) {
  const { snapToIndex } = useBottomSheet();
  const copy = jobStatusHint(job);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(animatedIndex.value, [0, 1], [0, 180], 'clamp')}deg` },
    ],
  }));

  const toggle = useCallback(
    () => snapToIndex(expanded ? 0 : 1),
    [expanded, snapToIndex],
  );

  return (
    <View style={{ height: HINT_HEIGHT }} className="justify-center">
      <View className="items-center pb-1">
        <View className="h-1 w-9 rounded-full bg-border-strong" />
      </View>
      <View className="flex-row items-center px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.title} — ${copy.description}`}
          accessibilityHint="Opens the details of this booking"
          onPress={() => router.push(`/booking/${job.id}`)}
          className="flex-1 flex-row items-center"
        >
          <ServiceImage
            uri={job.service.icon}
            accessibilityLabel={job.service.name}
            className="h-11 w-11 rounded-xl"
          />
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
              {copy.description}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse booking details' : 'Expand booking details'}
          accessibilityHint="Shows more booking details"
          onPress={toggle}
          hitSlop={8}
          className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
        >
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-up" size={16} color={color['text-secondary']} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The customer's live active-order sheet, docked directly above the bottom
 * tab bar so the bar stays visible and clickable.
 *
 * `bottomOffset` is the measured tab-bar height plus the safe-area gap and is
 * provided by `(tabs)/_layout.tsx`. Collapsed it is a compact status hint;
 * the chevron or a drag springs it open to the job's state, the assigned
 * professional and the fast actions (call, chat, view). Tapping the hint
 * opens the booking details. Everything un-mounts when there is no active
 * order.
 */
export function ActiveJobHint({ bottomOffset }: { bottomOffset: number }) {
  const activeJob = useActiveJob();

  if (!activeJob) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { bottom: bottomOffset }]}>
      <ActiveJobSheet key={activeJob.id} job={activeJob} bottomOffset={bottomOffset} />
    </View>
  );
}

function ActiveJobSheet({ job, bottomOffset }: { job: JobDetail; bottomOffset: number }) {
  const { height: windowHeight } = useWindowDimensions();
  const sceneHeight = Math.max(0, windowHeight - bottomOffset);

  const snapPoints = useMemo(
    () => {
      const expanded = Math.min(
        Math.round(sceneHeight * EXPANDED_SCENE_RATIO),
        Math.max(HINT_HEIGHT + 8, sceneHeight - 120),
      );
      return [HINT_HEIGHT, Math.max(HINT_HEIGHT + 8, expanded)] as number[];
    },
    [sceneHeight],
  );

  const springConfig = useBottomSheetSpringConfigs({
    damping: 22,
    stiffness: 240,
    mass: 0.9,
    overshootClamping: true,
  });

  const [expanded, setExpanded] = useState(false);
  const lastIndex = useRef(0);
  const handleChange = useCallback((index: number) => {
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    setExpanded(index > 0);
    void Haptics.impactAsync(
      index > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
  }, []);

  const copy = jobStatusHint(job);
  const stage = activeJobStageIndex(job.status);
  const progressPct = Math.min(100, Math.round(((stage + 1) / ACTIVE_JOB_STAGES.length) * 100));
  const amount = job.finalPayPaise ?? job.agreedPayPaise ?? job.basePayPaise;
  const amountLabel = job.status === JobStatus.PAID ? 'Amount paid' : 'Amount';
  const locationLabel = job.locationLabel ?? job.placeDescription ?? 'Customer location';

  const callPro = useCallback(() => {
    const phone = job.pro?.phone;
    if (!phone) return;
    void openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Could not start the call', 'No app on this device can place calls.');
    });
  }, [job.pro?.phone]);

  const openChat = useCallback(() => {
    router.push({ pathname: '/booking/[id]/chat', params: { id: job.id } });
  }, [job.id]);

  const openJob = useCallback(() => {
    router.push(`/booking/${job.id}`);
  }, [job.id]);

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableOverDrag={false}
      enablePanDownToClose={false}
      enableDynamicSizing={false}
      animationConfigs={springConfig}
      backgroundComponent={SheetBackground}
      handleComponent={(props) => <HintHandle {...props} job={job} expanded={expanded} />}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={1}
          disappearsOnIndex={0}
          pressBehavior="collapse"
          opacity={0.35}
        />
      )}
      onChange={handleChange}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        style={styles.content}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        <View className="flex-row items-start justify-between pt-1">
          <View className="flex-1 pr-3">
            <Text variant="titleLg" numberOfLines={1}>
              {job.service.name}
            </Text>
            <Text variant="footnote" className="mt-1 text-text-secondary" numberOfLines={1}>
              {job.customSkill ?? job.skill.name}
            </Text>
          </View>
          <Badge label={bookingStatusLabel(job.status)} tone={statusTone(job.status)} withDot />
        </View>

        <View className="mt-5">
          <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <View className="h-full rounded-full bg-brand" style={{ width: `${progressPct}%` }} />
          </View>
          <Text variant="caption" className="mt-2">
            {copy.stageLabel}
          </Text>
        </View>

        <View className="mt-4 flex-row items-center">
          <Ionicons name="location-outline" size={16} color={color['text-secondary']} />
          <Text variant="footnote" className="ml-1.5 flex-1 text-text-secondary" numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>

        <View className="mt-3 flex-row items-center justify-between rounded-xl border border-border px-4 py-3">
          <Text variant="label">{amountLabel}</Text>
          <Text variant="title">{formatRupees(amount)}</Text>
        </View>

        <Text variant="footnote" className="mt-3 text-text-secondary" numberOfLines={2}>
          {job.description}
        </Text>

        {job.pro ? (
          <View className="mt-5 flex-row items-center rounded-xl border border-border bg-surface-muted p-3">
            <Avatar name={job.pro.displayName ?? 'Professional'} size="md" />
            <View className="ml-3 flex-1">
              <Text variant="bodyStrong" numberOfLines={1}>
                {job.pro.displayName ?? 'Professional assigned'}
              </Text>
              {job.pro.rating !== null ? (
                <View className="mt-0.5 flex-row items-center">
                  <Ionicons name="star" size={12} color={color.warning} />
                  <Text variant="caption" className="ml-1">
                    {job.pro.rating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View className="mt-5 flex-row items-center rounded-xl border border-brand bg-brand-soft p-3">
            <FindingSpinner />
            <Text variant="footnote" className="ml-2.5 flex-1 text-brand">
              We're matching you with a nearby professional…
            </Text>
          </View>
        )}

        <View className="mt-5 gap-3">
          {job.pro ? (
            <View className="flex-row gap-3">
              {job.pro.phone ? (
                <Button
                  variant="secondary"
                  size="md"
                  label="Call"
                  fullWidth={false}
                  className="flex-1"
                  leading={<Ionicons name="call" size={18} color={color['text-primary']} />}
                  onPress={callPro}
                />
              ) : null}
              <Button
                variant="secondary"
                size="md"
                label="Chat"
                fullWidth={false}
                className="flex-1"
                leading={
                  <Ionicons name="chatbubble-ellipses" size={18} color={color['text-primary']} />
                }
                onPress={openChat}
              />
            </View>
          ) : null}
          <Button
            variant="primary"
            size="md"
            label={job.pro ? 'View booking' : 'Track this booking'}
            onPress={openJob}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}