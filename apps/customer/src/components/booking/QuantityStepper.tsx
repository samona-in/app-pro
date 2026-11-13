import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * `boxed` is the cart's filled control; `pill` is the compact rounded control
 * that sits under a catalogue work's artwork.
 */
export type QuantityStepperVariant = 'boxed' | 'pill';

/**
 * A `− value +` control. The caller owns the value, its bounds and the
 * accessibility labels, so the same control serves both quantities
 * (`PER_UNIT`) and durations (`PER_HOUR`).
 */
export function QuantityStepper({
  value,
  valueLabel,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  increaseDisabled = false,
  variant = 'boxed',
  valueClassName,
}: {
  value: string | number;
  valueLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
  /** `boxed` (default) fills with brand-soft; `pill` is a compact outline. */
  variant?: QuantityStepperVariant;
  /** Widens the value cell when the label is longer (e.g. `1 hr 30 min`). */
  valueClassName?: string;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center overflow-hidden',
        variant === 'pill'
          ? 'h-8 rounded-full border border-brand bg-surface'
          : 'h-9 rounded-sm border border-brand-soft bg-brand-soft',
      )}
    >
      <StepperSide
        icon="remove"
        side="left"
        label={decreaseLabel}
        disabled={decreaseDisabled}
        onPress={onDecrease}
        variant={variant}
      />
      <View className={cn('h-full items-center justify-center', valueClassName)}>
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          style={{ color: color.brand }}
          accessibilityLabel={valueLabel}
        >
          {value}
        </Text>
      </View>
      <StepperSide
        icon="add"
        side="right"
        label={increaseLabel}
        disabled={increaseDisabled}
        onPress={onIncrease}
        variant={variant}
      />
    </View>
  );
}

function StepperSide({
  icon,
  side,
  label,
  disabled,
  onPress,
  variant,
}: {
  icon: 'add' | 'remove';
  side: 'left' | 'right';
  label: string;
  disabled: boolean;
  onPress: () => void;
  variant: QuantityStepperVariant;
}) {
  const pill = variant === 'pill';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={cn(
        'h-full items-center justify-center active:opacity-60',
        pill ? 'w-8' : 'w-7',
        side === 'left'
          ? pill
            ? 'rounded-l-full'
            : 'rounded-l-sm'
          : pill
            ? 'rounded-r-full'
            : 'rounded-r-sm',
      )}
    >
      <Ionicons name={icon} size={16} color={disabled ? color['text-muted'] : color.brand} />
    </Pressable>
  );
}
