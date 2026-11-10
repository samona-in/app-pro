import { useMemo } from 'react';
import { StyleSheet, Text as RNText, View, type AccessibilityActionEvent } from 'react-native';
import WheelPicker from '@quidone/react-native-wheel-picker';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { MAX_SERVICE_RADIUS_KM, MIN_SERVICE_RADIUS_KM } from '@/utils/service-radius';

/** One wheel row's height; five rows are visible at a time. */
const ITEM_HEIGHT = 44;
const VISIBLE_ITEM_COUNT = 5;

const styles = StyleSheet.create({
  item: {
    lineHeight: ITEM_HEIGHT,
    textAlign: 'center',
  },
  /** The centred row reads as pure black; the rows above and below stay muted. */
  itemSelected: {
    color: color.black,
  },
});

export interface ServiceRadiusWheelProps {
  /** The radius the wheel should sit on. */
  value: number;
  min?: number;
  max?: number;
  /** In-flight save: the wheel cannot be scrolled. */
  disabled?: boolean;
  /** Fired when the wheel comes to rest on another whole kilometre. */
  onChange: (km: number) => void;
  accessibilityLabel?: string;
  className?: string;
}

/**
 * Whole-kilometre service radius picker, built on
 * `@quidone/react-native-wheel-picker`.
 *
 * The wheel owns the gesture while it spins and reports only the value it
 * settles on, so the network is not hit for every row passed on the way to the
 * target. The centred row is highlighted with a brand ring and soft fill to
 * keep the chosen radius readable at a glance.
 */
export function ServiceRadiusWheel({
  value,
  min = MIN_SERVICE_RADIUS_KM,
  max = MAX_SERVICE_RADIUS_KM,
  disabled = false,
  onChange,
  accessibilityLabel,
  className,
}: ServiceRadiusWheelProps) {
  const { t } = useTranslation();

  const data = useMemo(
    () =>
      Array.from({ length: max - min + 1 }, (_, index) => {
        const km = min + index;
        return { value: km, label: t('format.km', { value: km }) };
      }),
    [max, min, t],
  );

  function onAccessibilityAction(event: AccessibilityActionEvent) {
    if (disabled) return;
    const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = Math.max(min, Math.min(max, value + step));
    if (next === value) return;
    void Haptics.selectionAsync().catch(() => {});
    onChange(next);
  }

  return (
    <View
      className={cn('w-full items-center', className)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityValue={{ min, max, now: value, text: t('format.km', { value }) }}
      onAccessibilityAction={onAccessibilityAction}
    >
      <WheelPicker
        data={data}
        value={value}
        width="100%"
        itemHeight={ITEM_HEIGHT}
        visibleItemCount={VISIBLE_ITEM_COUNT}
        readOnly={disabled}
        enableScrollByTapOnItem
        itemTextStyle={{
          color: color['text-primary'],
          fontSize: 20,
          fontWeight: '600',
        }}
        renderItem={({ item, itemTextStyle }) => (
          <RNText style={[itemTextStyle, styles.item, item.value === value && styles.itemSelected]}>
            {item.label}
          </RNText>
        )}
        overlayItemStyle={{
          // The overlay paints *above* the wheel, so it must stay translucent:
          // an opaque fill would hide the selected number underneath it.
          backgroundColor: `${color['brand-soft']}4D`,
          borderColor: color.brand,
          borderWidth: 1,
          borderRadius: 10,
          opacity: 1,
        }}
        onValueChanged={({ item }) => {
          void Haptics.selectionAsync().catch(() => {});
          onChange(item.value);
        }}
      />
    </View>
  );
}
