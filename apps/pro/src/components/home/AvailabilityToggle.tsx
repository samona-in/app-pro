import { useEffect } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color } from '@/theme';

const TRACK_WIDTH = 112;
const TRACK_HEIGHT = 38;
const THUMB_SIZE = 30;
const THUMB_INSET = 4;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;
const ANIMATION_MS = 220;

export interface AvailabilityToggleProps {
  isOnline: boolean;
  /** The backend call is in flight; taps are ignored and the thumb shows a spinner. */
  isTransitioning: boolean;
  onToggle: () => void;
}

/**
 * The header's on/off-duty pill. The thumb (and its status dot) slides between
 * the two labels while the track crossfades green/grey, so the switch reads as
 * one physical control. It is disabled for the whole backend round-trip; the
 * status only turns green after `POST /pros/availability` succeeds.
 */
export function AvailabilityToggle({
  isOnline,
  isTransitioning,
  onToggle,
}: AvailabilityToggleProps) {
  const { t } = useTranslation();
  const progress = useSharedValue(isOnline ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isOnline ? 1 : 0, {
      duration: ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [isOnline, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [color['text-secondary'], color.online],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [color['text-muted'], color.online],
    ),
  }));

  const onlineLabelStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const offlineLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={
        isOnline ? t('dashboard.header.onDuty') : t('dashboard.header.offDuty')
      }
      accessibilityState={{ checked: isOnline, disabled: isTransitioning }}
      disabled={isTransitioning}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onToggle();
      }}
      hitSlop={6}
      style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT }}
    >
      <Animated.View
        style={trackStyle}
        className="h-full w-full justify-center overflow-hidden rounded-full"
      >
        <Animated.View
          style={[
            thumbStyle,
            {
              position: 'absolute',
              top: THUMB_INSET,
              left: THUMB_INSET,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: color.surface,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: color['text-primary'],
              shadowOpacity: 0.12,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
          ]}
        >
          {isTransitioning ? (
            <ActivityIndicator size="small" color={isOnline ? color.online : color['text-muted']} />
          ) : (
            <Animated.View
              style={[
                dotStyle,
                { width: 10, height: 10, borderRadius: 5 },
              ]}
            />
          )}
        </Animated.View>

        <Animated.Text
          numberOfLines={1}
          style={[
            onlineLabelStyle,
            {
              position: 'absolute',
              left: THUMB_INSET,
              right: THUMB_SIZE + THUMB_INSET * 2,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.4,
              color: color['brand-contrast'],
            },
          ]}
        >
          {t('dashboard.header.onDuty')}
        </Animated.Text>

        <Animated.Text
          numberOfLines={1}
          style={[
            offlineLabelStyle,
            {
              position: 'absolute',
              left: THUMB_SIZE + THUMB_INSET * 2,
              right: THUMB_INSET,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.4,
              color: color['brand-contrast'],
            },
          ]}
        >
          {t('dashboard.header.offDuty')}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}
