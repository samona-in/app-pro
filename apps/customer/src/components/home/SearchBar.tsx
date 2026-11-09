import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
  type PressableProps,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { Text } from '@/components/ui';
import { useTypedPlaceholder } from '@/hooks';
import { useIsReduceMotionEnabled } from '@/hooks/use-reduce-motion';
import { elevation, color } from '@/theme';
import { cn } from '@/utils/cn';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface SearchBarProps extends Omit<PressableProps, 'style'> {
  placeholder?: string;
  className?: string;
}

const PLACEHOLDER_PHRASES = ['electrician', 'plumber', 'carpenter'];

/** A small, soft dip on touch — the same language as the floating tab bar. */
const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.6 };

/** How long the highlight takes to travel once around the field. */
const BEAM_DURATION_MS = 6000;
/** Length of the lit segment, in points. */
const BEAM_LENGTH = 64;
/** Matches `rounded-2xl` in the theme. */
const FIELD_RADIUS = 28;

/**
 * Tappable home search bar.
 *
 * A tall, rounded field in the Zomato mould: a leading search icon, the living
 * typewriter label, and a black arrow button that makes the action obvious.
 * A brand-blue beam glides around the border so the field reads as the live
 * control on the page; it stops under reduced motion and while the home tab is
 * in the background. Pressing the field dips it slightly and gives a light
 * haptic before opening the search screen.
 */
export function SearchBar({
  placeholder = 'Search for',
  onPress,
  onPressIn,
  onPressOut,
  className,
  ...rest
}: SearchBarProps) {
  const typed = useTypedPlaceholder(PLACEHOLDER_PHRASES);
  const reduceMotion = useIsReduceMotionEnabled();
  const scale = useSharedValue(1);
  const beamProgress = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  // Inset half a stroke so the ring lands exactly inside the clipped field.
  const rectX = 0.5;
  const rectY = 0.5;
  const rectWidth = Math.max(size.width - 1, 0);
  const rectHeight = Math.max(size.height - 1, 0);
  const radius = Math.min(FIELD_RADIUS, rectWidth / 2, rectHeight / 2);
  const rectRadius = Math.max(radius, 0);

  const perimeter =
    rectWidth > 0 && rectHeight > 0
      ? 2 * (rectWidth - 2 * rectRadius) +
        2 * (rectHeight - 2 * rectRadius) +
        2 * Math.PI * rectRadius
      : 0;

  const beamVisible = !reduceMotion && isFocused && perimeter > 0;

  useEffect(() => {
    if (!beamVisible) {
      cancelAnimation(beamProgress);
      beamProgress.value = 0;
      return;
    }

    beamProgress.value = 0;
    beamProgress.value = withRepeat(
      withTiming(1, { duration: BEAM_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );

    return () => cancelAnimation(beamProgress);
  }, [beamProgress, beamVisible]);

  const beamProps = useAnimatedProps(() => ({
    strokeDashoffset: -beamProgress.value * perimeter,
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }

  // The gap completes exactly one lap, so the dash loops without a seam.
  const dashGap = Math.max(perimeter - BEAM_LENGTH, 1);

  return (
    <Animated.View style={[animatedStyle, elevation.sm]} className={cn('rounded-2xl', className)}>
      <View className="relative overflow-hidden rounded-2xl bg-surface" onLayout={handleLayout}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={`${placeholder} ${PLACEHOLDER_PHRASES.map((phrase) => `"${phrase}"`).join(', ')}`}
          onPressIn={(event) => {
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withSpring(0.98, PRESS_SPRING);
            onPressIn?.(event);
          }}
          onPressOut={(event) => {
            // eslint-disable-next-line react-hooks/immutability
            scale.value = withSpring(1, PRESS_SPRING);
            onPressOut?.(event);
          }}
          onPress={(event) => {
            // A light tick makes the field feel like a real control, not a label.
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onPress?.(event);
          }}
          className="min-h-[56px] flex-row items-center px-4 active:opacity-90"
          {...rest}
        >
          <Ionicons name="search" size={20} color={color['text-primary']} />

          <Text
            variant="bodyLg"
            className="ml-2.5 flex-1 text-[18px] font-bold text-text-secondary"
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {typed ? `${placeholder} "${typed}"` : placeholder}
          </Text>
        </Pressable>

        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
          {/* The quiet base border the beam travels over. */}
          <Rect
            x={rectX}
            y={rectY}
            width={rectWidth}
            height={rectHeight}
            rx={rectRadius}
            ry={rectRadius}
            fill="none"
            stroke={color.border}
            strokeWidth={1}
          />

          {beamVisible ? (
            <AnimatedRect
              x={rectX}
              y={rectY}
              width={rectWidth}
              height={rectHeight}
              rx={rectRadius}
              ry={rectRadius}
              fill="none"
              stroke={color.brand}
              strokeWidth={1}
              strokeLinecap="round"
              strokeDasharray={[BEAM_LENGTH, dashGap]}
              animatedProps={beamProps}
            />
          ) : null}
        </Svg>
      </View>
    </Animated.View>
  );
}
