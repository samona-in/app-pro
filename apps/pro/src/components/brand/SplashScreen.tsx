import { useCallback, useRef } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import splashMark from '@/assets/images/splash-icon.png';
import samonaWordmark from '@/assets/images/samona-wordmark.png';

/**
 * The SAMONA splash: brand-blue field with the white chevron mark above the
 * SAMONA wordmark, entering as a single unit.
 *
 * Purely presentational — visibility, timing of the handoff and the native
 * splash are owned by `SplashGate`, so this can be rendered in tests or a
 * preview without side effects.
 */

/** Intrinsic aspect ratios of the two source assets (width / height). */
const WORDMARK_ASPECT = 1740 / 263;
const MARK_ASPECT = 228 / 213;

/** Mark width as a fraction of the wordmark width, and the gap under it. */
const MARK_TO_WORD_RATIO = 0.22;
const GAP_TO_MARK_RATIO = 0.5;

/** Lockup width tracks the screen but never dominates a small device. */
const WIDTH_RATIO = 0.62;
const MIN_WORD_WIDTH = 150;
const MAX_WORD_WIDTH = 280;

/** Apple-style entrance: fade, an 8px rise and a barely-there scale. */
const INTRO_MS = 600;
const RISE_PX = 8;
const SCALE_FROM = 0.95;

export interface SplashScreenProps {
  /** Fires after the first layout pass — safe point to hide the native splash. */
  onFirstLayout?: () => void;
  /** Fires when the entrance animation has settled (or immediately under reduced motion). */
  onIntroComplete?: () => void;
}

export function SplashScreen({ onFirstLayout, onIntroComplete }: SplashScreenProps) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // Start hidden so the entrance animates; reduced motion starts settled.
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const started = useRef(false);
  const reported = useRef(false);

  const reportIntro = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onIntroComplete?.();
  }, [onIntroComplete]);

  /**
   * Start the entrance on first layout: that is the same frame the native
   * splash is hidden, so a slow boot holds the OS splash longer and the
   * animation is never already finished when the reveal happens.
   */
  const startIntro = useCallback(() => {
    if (started.current) return;
    started.current = true;

    if (reducedMotion) {
      reportIntro();
      return;
    }

    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
    progress.value = withTiming(
      1,
      { duration: INTRO_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) },
      (finished) => {
        if (finished) runOnJS(reportIntro)();
      },
    );
  }, [progress, reducedMotion, reportIntro]);

  const handleFirstLayout = useCallback(() => {
    onFirstLayout?.();
    startIntro();
  }, [onFirstLayout, startIntro]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * RISE_PX },
      { scale: SCALE_FROM + (1 - SCALE_FROM) * progress.value },
    ],
  }));

  const wordWidth = Math.min(Math.max(width * WIDTH_RATIO, MIN_WORD_WIDTH), MAX_WORD_WIDTH);
  const markWidth = wordWidth * MARK_TO_WORD_RATIO;
  const markHeight = markWidth / MARK_ASPECT;
  const gap = markHeight * GAP_TO_MARK_RATIO;

  return (
    <View style={styles.root} onLayout={handleFirstLayout}>
      <Animated.View
        style={[styles.logo, logoStyle]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="SAMONA Pro"
      >
        <Image
          source={splashMark}
          style={{ width: markWidth, height: markHeight }}
          contentFit="contain"
        />
        <Image
          source={samonaWordmark}
          style={{ width: wordWidth, height: wordWidth / WORDMARK_ASPECT, marginTop: gap }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    alignItems: 'center',
  },
});
