import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export type IconButtonVariant = 'plain' | 'surface';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Any Ionicons glyph name. */
  name: React.ComponentProps<typeof Ionicons>['name'];
  /** Required: an icon alone gives screen readers nothing to announce. */
  accessibilityLabel: string;
  size?: number;
  tint?: string;
  variant?: IconButtonVariant;
  haptic?: boolean;
  className?: string;
}

export function IconButton({
  name,
  accessibilityLabel,
  size = 22,
  tint = color['text-primary'],
  variant = 'plain',
  haptic = false,
  disabled,
  onPress,
  className,
  ...rest
}: IconButtonProps) {
  const handlePress: PressableProps['onPress'] = (event) => {
    if (haptic) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={handlePress}
      // h-11/w-11 keeps the target at 44pt even with a small glyph.
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full active:opacity-70',
        variant === 'surface' && 'bg-surface-muted',
        disabled === true && 'opacity-40',
        className,
      )}
      {...rest}
    >
      <Ionicons name={name} size={size} color={tint} />
    </Pressable>
  );
}
