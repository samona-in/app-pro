import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color } from '@/theme';

/**
 * A round +/- control shared by the booking details sheet and the cart. Used
 * for both quantities (`PER_UNIT`) and durations (`PER_HOUR`); the caller
 * owns the value, its bounds and the accessibility label.
 */
export function StepperButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={
        disabled
          ? 'h-9 w-9 items-center justify-center rounded-full bg-surface-muted'
          : 'h-9 w-9 items-center justify-center rounded-full bg-brand-soft active:opacity-70'
      }
    >
      <Ionicons name={icon} size={18} color={disabled ? color['text-muted'] : color.brand} />
    </Pressable>
  );
}
