import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the platform's "reduce motion" accessibility setting is on.
 *
 * Animated surfaces (carousels, transitions, looping motion) should stop
 * moving when this is true. Manual gestures stay available so the customer
 * keeps full control.
 */
export function useIsReduceMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setEnabled(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return enabled;
}
