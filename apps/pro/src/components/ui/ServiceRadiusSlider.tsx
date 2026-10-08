import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import {
  MAX_SERVICE_RADIUS_KM,
  MIN_SERVICE_RADIUS_KM,
  translateFromValue,
  valueFromTranslate,
} from '@/utils/service-radius';

const KNOB_SIZE = 40;
const TRACK_HEIGHT = 8;
const TRACK_SIDE_PADDING = 20;
const KNOB_TOP = 8;

function travel(trackWidth: number) {
  return Math.max(0, trackWidth - KNOB_SIZE - TRACK_SIDE_PADDING * 2);
}

export interface ServiceRadiusSliderProps {
  /** The currently saved radius; a changed prop animates the knob to it. */
  value: number;
  min?: number;
  max?: number;
  /** In-flight save: the knob shows a spinner and the gesture is disabled. */
  loading?: boolean;
  disabled?: boolean;
  /** Fired live while the thumb is dragged, with the nearest whole kilometre. */
  onValueChange?: (km: number) => void;
  /** Fired once on release (or an accessibility increment/decrement). */
  onRelease: (km: number) => void;
  accessibilityLabel?: string;
  className?: string;
}

/**
 * Whole-kilometre service radius slider.
 *
 * The value is committed only when the thumb is released — the network must
 * not be hit while the finger is still moving. `value` is the saved radius and
 * drives the resting knob position, so a save, rollback or refetch animates
 * the knob to match; during a drag the thumb is owned by the gesture.
 */
export function ServiceRadiusSlider({
  value,
  min = MIN_SERVICE_RADIUS_KM,
  max = MAX_SERVICE_RADIUS_KM,
  loading = false,
  disabled = false,
  onValueChange,
  onRelease,
  accessibilityLabel,
  className,
}: ServiceRadiusSliderProps) {
  const translateX = useSharedValue(0);
  const trackWidth = useSharedValue(0);
  const dragging = useSharedValue(false);
  // Where the thumb sat when the gesture began. Pan's `translationX` is the
  // finger's delta from the touch point, so the knob must travel from its
  // current position (16 km, say) rather than reset toward zero on the first
  // movement.
  const startTranslate = useSharedValue(0);
  const [liveKm, setLiveKm] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  function onTrackLayout(e: LayoutChangeEvent) {
    trackWidth.value = e.nativeEvent.layout.width;
    translateX.value = withTiming(translateFromValue(value, min, max, travel(e.nativeEvent.layout.width)), {
      duration: 160,
    });
  }

  // Animate the resting knob whenever the saved radius changes (a save, a
  // rollback, or a refetch), unless the finger is currently dragging. The
  // prepare snapshot is the knob's target position, so this only reacts when
  // that position actually moves. The geometry is inlined — `travel` and the
  // utils module run on the JS thread only, so a worklet cannot call them.
  useAnimatedReaction(
    () => {
      const track = Math.max(0, trackWidth.value - KNOB_SIZE - TRACK_SIDE_PADDING * 2);
      if (track <= 0) return 0;
      const clamped = Math.min(max, Math.max(min, value));
      return ((clamped - min) / (max - min || 1)) * track;
    },
    (current, previous) => {
      if (current === previous) return;
      if (dragging.value) return;
      translateX.value = withTiming(current, { duration: 160 });
    },
    [value, min, max],
  );

  const updateLive = useCallback(
    (translate: number) => {
      const km = valueFromTranslate(translate, min, max, travel(trackWidth.value));
      setLiveKm(km);
      onValueChange?.(km);
    },
    [onValueChange, min, max, trackWidth],
  );

  // Not memoized on purpose: it commits the radius and is referenced by the
  // gesture below, which is rebuilt every render, so it is never stale.
  function finish(translate: number) {
    const km = valueFromTranslate(translate, min, max, travel(trackWidth.value));
    setLiveKm(km);
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
    translateX.value = withSpring(translateFromValue(km, min, max, travel(trackWidth.value)), {
      damping: 20,
      stiffness: 300,
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onRelease(km);
  }

  const gesture = Gesture.Pan()
    .enabled(!disabled && !loading)
    .activeOffsetX(4)
    .onBegin(() => {
      'worklet';
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
      dragging.value = true;
      startTranslate.value = translateX.value;
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      'worklet';
      const maxTranslate = Math.max(0, trackWidth.value - KNOB_SIZE - TRACK_SIDE_PADDING * 2);
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
      translateX.value = Math.max(
        0,
        Math.min(startTranslate.value + e.translationX, maxTranslate),
      );
      // The nearest whole kilometre is derived on the JS thread for the label.
      runOnJS(updateLive)(translateX.value);
    })
    .onEnd(() => {
      'worklet';
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
      dragging.value = false;
      runOnJS(setIsDragging)(false);
      const settled = translateX.value;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
      translateX.value = withSpring(settled, { damping: 20, stiffness: 300 });
      runOnJS(finish)(settled);
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: TRACK_SIDE_PADDING + translateX.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + KNOB_SIZE / 2,
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: TRACK_SIDE_PADDING + translateX.value - 24 }],
  }));

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    if (disabled || loading) return;
    const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = Math.max(min, Math.min(max, value + step));
    finish(translateFromValue(next, min, max, travel(trackWidth.value)));
  }

  const inactive = disabled || loading;

  return (
    <View
      className={cn('w-full', className)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityValue={{ min, max, now: value, text: `${value}` }}
      onAccessibilityAction={onAccessibilityAction}
    >
      <GestureDetector gesture={gesture}>
        <View onLayout={onTrackLayout} className="h-14 w-full">
          {/* Live value bubble, rides above the thumb. */}
          <Animated.View
            className="absolute h-6 w-12 items-center justify-center rounded-lg bg-brand"
            style={[bubbleStyle, { position: 'absolute', top: -26 }]}
          >
            <Text
              variant="footnote"
              className="font-semibold"
              style={{ color: color['brand-contrast'] }}
            >
              {isDragging ? liveKm : value}
            </Text>
          </Animated.View>

          {/* Track and its filled portion. */}
          <View
            className={cn('rounded-full', inactive && 'opacity-60')}
            style={{
              position: 'absolute',
              left: TRACK_SIDE_PADDING,
              right: TRACK_SIDE_PADDING,
              top: (56 - TRACK_HEIGHT) / 2,
              height: TRACK_HEIGHT,
              backgroundColor: color['surface-muted'],
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <Animated.View
              className="rounded-full"
              style={[
                {
                  top: -1,
                  bottom: -1,
                  backgroundColor: inactive ? color['text-muted'] : color.brand,
                },
                fillStyle,
              ]}
            />
          </View>

          {/* Draggable thumb. */}
          <Animated.View
            className={cn('h-10 w-10 items-center justify-center rounded-full', inactive && 'opacity-80')}
            style={[
              {
                position: 'absolute',
                top: KNOB_TOP,
                left: 0,
                backgroundColor: inactive ? color['surface-muted'] : color.surface,
                borderWidth: 1,
                borderColor: inactive ? color.border : color.brand,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              },
              knobStyle,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={color.brand} />
            ) : (
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color.brand }} />
            )}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}