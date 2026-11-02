import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import RangeSlider from 'react-native-fast-range-slider';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { MAX_SERVICE_RADIUS_KM, MIN_SERVICE_RADIUS_KM } from '@/utils/service-radius';

/** Height the library lays its track out in; the wrapper mirrors it. */
const SLIDER_HEIGHT = 50;
/** Inset the library puts around the track (`HORIZONTAL_PADDING`). */
const TRACK_INSET = 15;
const THUMB_SIZE = 32;
const TRACK_HEIGHT = 8;

export interface ServiceRadiusSliderProps {
  /** The currently saved radius; a changed prop moves the resting thumb to it. */
  value: number;
  min?: number;
  max?: number;
  /** In-flight save: the slider shows a spinner and the gestures are disabled. */
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
 * Whole-kilometre service radius slider, built on
 * `react-native-fast-range-slider`.
 *
 * That library only ships a two-thumb range. We keep its left handle pinned at
 * `min` and let the right handle carry the radius, so the selected track runs
 * from the bottom of the range out to the chosen radius — the same read as a
 * single-value slider. A pro who grabs the pinned handle (or drags past the
 * live radius) simply gets it snapped back on release.
 *
 * The value is committed only when a handle is released — the network must not
 * be hit while the finger is still moving. `value` is the saved radius and
 * drives the resting thumb position, so a save, rollback or refetch moves it;
 * while a drag is in flight the gesture owns the handle.
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
  const [availableWidth, setAvailableWidth] = useState(0);
  /**
   * Bumped to remount the slider, which re-seeds both handles from their
   * initial values — the only way the library snaps the pinned handle back.
   */
  const [resetNonce, setResetNonce] = useState(0);
  const trackWidth = Math.max(0, availableWidth - TRACK_INSET * 2);

  function onLayout(event: LayoutChangeEvent) {
    setAvailableWidth(event.nativeEvent.layout.width);
  }

  const handleValuesChange = useCallback(
    ([, radius]: [number, number]) => {
      onValueChange?.(radius);
    },
    [onValueChange],
  );

  const handleValuesChangeFinish = useCallback(
    ([pinned, radius]: [number, number]) => {
      // The left handle is not the radius; if it moved, put it back on `min`.
      if (pinned !== min) setResetNonce((nonce) => nonce + 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onRelease(radius);
    },
    [min, onRelease],
  );

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    if (disabled || loading) return;
    const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = Math.max(min, Math.min(max, value + step));
    if (next === value) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onRelease(next);
  }

  const fraction = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const thumbCenter = TRACK_INSET + fraction * trackWidth;
  const inactive = disabled || loading;

  return (
    <View
      className={cn('w-full justify-center', className)}
      style={{ height: SLIDER_HEIGHT }}
      onLayout={onLayout}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityValue={{ min, max, now: value, text: `${value}` }}
      onAccessibilityAction={onAccessibilityAction}
    >
      {trackWidth > 0 ? (
        <RangeSlider
          key={resetNonce}
          min={min}
          max={max}
          step={1}
          width={trackWidth}
          thumbSize={THUMB_SIZE}
          trackHeight={TRACK_HEIGHT}
          // The pinned handle must be able to sit right on top of `min`.
          minimumDistance={0}
          showThumbLines={false}
          enabled={!inactive}
          initialMinValue={min}
          initialMaxValue={value}
          selectedTrackColor={inactive ? color['text-muted'] : color.brand}
          unselectedTrackStyle={{
            backgroundColor: color['surface-muted'],
            borderWidth: 1,
            borderColor: color.border,
          }}
          thumbStyle={{
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: inactive ? color.border : color.brand,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
          pressedThumbStyle={{ opacity: 0.9 }}
          onValuesChange={handleValuesChange}
          onValuesChangeFinish={handleValuesChangeFinish}
          leftThumbAccessibilityLabel={accessibilityLabel}
          rightThumbAccessibilityLabel={accessibilityLabel}
        />
      ) : null}

      {loading ? (
        <View
          pointerEvents="none"
          className="absolute h-5 w-5 items-center justify-center"
          style={{ left: thumbCenter - 10, top: (SLIDER_HEIGHT - 20) / 2 }}
        >
          <ActivityIndicator size="small" color={color.brand} />
        </View>
      ) : null}
    </View>
  );
}
