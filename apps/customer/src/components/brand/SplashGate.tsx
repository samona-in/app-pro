import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color } from '@/theme';
import { SplashScreen } from './SplashScreen';

/**
 * Owns the boot splash and its handoff to the app.
 *
 * It renders `SplashScreen` as a full-screen overlay above the navigator, keeps
 * the OS splash up until the overlay has painted, then dissolves to reveal the
 * destination. The boot router (`src/app/index.tsx`) is the only route at `/`;
 * the moment navigation leaves it the destination is mounted, so that is the
 * signal the splash is free to go. It waits for the entrance to settle first so
 * a fast redirect never cuts the animation.
 */

/** The boot router's path. Anything else means the destination is active. */
const BOOT_ROUTE = '/';
const CROSSFADE_MS = 250;

export interface SplashGateProps {
  /** Fires as the splash begins to leave, so the shell can swap its chrome. */
  onExit?: () => void;
}

export function SplashGate({ onExit }: SplashGateProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const [hidden, setHidden] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const nativeHidden = useRef(false);
  const exiting = useRef(false);

  /** Hide the OS splash once, after the JS overlay has painted. */
  const hideNativeSplash = useCallback(() => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    void NativeSplash.hideAsync().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    hideNativeSplash();
    onExit?.();

    // Reduced motion: remove the overlay in zero time; the crossfade otherwise
    // is a single opacity tween.
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value, see SwipeToConfirm.
    opacity.value = withTiming(0, { duration: reducedMotion ? 0 : CROSSFADE_MS }, (finished) => {
      if (finished) runOnJS(setHidden)(true);
    });
  }, [hideNativeSplash, onExit, opacity, reducedMotion]);

  const routingResolved = pathname !== BOOT_ROUTE;

  useEffect(() => {
    // One-shot handoff: both conditions are latched refs/states, so a re-render
    // or prop change can never re-trigger this after exit has begun.
    if (routingResolved && introComplete) exit();
  }, [routingResolved, introComplete, exit]);

  const handleIntroComplete = useCallback(() => setIntroComplete(true), []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (hidden) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, animatedStyle]}>
      <SplashScreen onFirstLayout={hideNativeSplash} onIntroComplete={handleIntroComplete} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Above the navigator, and never transparent: the app can mount underneath
    // without ever showing through before the crossfade starts.
    zIndex: 100,
    backgroundColor: color.brand,
  },
});
