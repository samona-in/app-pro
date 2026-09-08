import { useCallback } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

const KNOB_SIZE = 52;
const TRACK_HEIGHT = 60;
const TRACK_PADDING = 4;
const CONFIRM_THRESHOLD = 0.78;
const RESET_DELAY_MS = 300;

export interface SwipeToConfirmProps {
  label: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * Slide-to-confirm action — the signature Pro CTA for one-handed, in-motion
 * steps like "On My Way". Dragging the thumb across releases a high-impact
 * haptic and fires `onConfirm`; the thumb never rests at the far end. Once the
 * request settles the thumb springs back so the next stage — or the same stage
 * after an error — is immediately ready to swipe.
 */
export function SwipeToConfirm({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  className,
}: SwipeToConfirmProps) {
  const translateX = useSharedValue(0);
  const trackWidth = useSharedValue(0);

  const confirm = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    void onConfirm();
  }, [onConfirm]);

  const gesture = Gesture.Pan()
    .enabled(!disabled && !loading)
    .activeOffsetX(10)
    .onUpdate((e) => {
      'worklet';
      const maxTranslate = trackWidth.value - KNOB_SIZE - TRACK_PADDING * 2;
      translateX.value = Math.max(0, Math.min(e.translationX, maxTranslate));
    })
    .onEnd(() => {
      'worklet';
      const maxTranslate = trackWidth.value - KNOB_SIZE - TRACK_PADDING * 2;
      const reached = translateX.value >= maxTranslate * CONFIRM_THRESHOLD;
      if (reached) {
        translateX.value = withSpring(maxTranslate, { damping: 20, stiffness: 200 });
        runOnJS(confirm)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const labelStyle = useAnimatedStyle(() => {
    const maxTranslate = trackWidth.value - KNOB_SIZE - TRACK_PADDING * 2;
    const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
    return {
      opacity: interpolate(progress, [0, 0.45], [1, 0], 'clamp'),
      transform: [{ translateX: interpolate(progress, [0, 1], [0, 30], 'clamp') }],
    };
  });

  const arrowStyle = useAnimatedStyle(() => {
    const maxTranslate = trackWidth.value - KNOB_SIZE - TRACK_PADDING * 2;
    const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
    return {
      opacity: interpolate(progress, [0, 0.3], [0.4, 1], 'clamp'),
      transform: [{ translateX: interpolate(progress, [0, 1], [0, 4], 'clamp') }],
    };
  });

  // Return the knob to its starting position once confirmation settles, so the
  // next action label — or the same one after an error — is immediately
  // visible and ready to swipe. The knob is kept at the far end only while the
  // request is in flight (`loading`), and is never allowed to rest there.
  // Reacting to the loading flag (rather than the label) covers the failure
  // path too: on error the label does not change, but the knob must still
  // spring back. Done on the UI thread. The immutability rule cannot see that
  // Reanimated's `useSharedValue` is a mutable ref, so it flags the write here
  // (but, inconsistently, not the identical writes in the pan handler above).
  useAnimatedReaction(
    () => loading,
    (current, previous) => {
      if (previous === true && current === false) {
        // eslint-disable-next-line react-hooks/immutability
        translateX.value = withDelay(RESET_DELAY_MS, withSpring(0, { damping: 20, stiffness: 300 }));
      }
    },
    [loading],
  );

  function onTrackLayout(e: LayoutChangeEvent) {
    trackWidth.value = e.nativeEvent.layout.width;
  }

  const isInactive = disabled || loading;

  return (
    <View
      onLayout={onTrackLayout}
      style={{ height: TRACK_HEIGHT }}
      className={cn(
        'w-full overflow-hidden rounded-2xl',
        isInactive ? 'bg-surface-muted' : 'bg-brand',
        className,
      )}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View className="flex-1">
          {/* Centred label, slides off as the thumb travels. */}
          <Animated.View
            className="absolute inset-0 flex-row items-center justify-center"
            style={labelStyle}
          >
            <Text
              variant="bodyLg"
              className="font-semibold"
              style={{ color: isInactive ? color['text-muted'] : color['brand-contrast'] }}
            >
              {label}
            </Text>
          </Animated.View>

          {/* Draggable thumb. */}
          <Animated.View
            className="absolute"
            style={[
              {
                top: TRACK_PADDING,
                left: TRACK_PADDING,
                width: KNOB_SIZE,
                height: KNOB_SIZE,
              },
              knobStyle,
            ]}
          >
            <View
              className={cn(
                'h-full w-full items-center justify-center rounded-2xl',
                isInactive ? 'bg-surface-muted border border-border' : 'bg-white',
              )}
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={isInactive ? color['text-muted'] : color.brand}
                />
              ) : (
                <Animated.View style={arrowStyle}>
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={isInactive ? color['text-muted'] : color.brand}
                  />
                </Animated.View>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
