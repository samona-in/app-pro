import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, { container: string; label: string; spinner: string }> =
  {
    primary: {
      container: 'bg-brand',
      label: 'text-brand-contrast',
      spinner: color['brand-contrast'],
    },
    secondary: {
      container: 'bg-surface border border-border-strong',
      label: 'text-text-primary',
      spinner: color['text-primary'],
    },
    ghost: {
      container: 'bg-transparent',
      label: 'text-text-primary',
      spinner: color['text-primary'],
    },
    success: {
      container: 'bg-success',
      label: 'text-text-inverse',
      spinner: color['text-inverse'],
    },
    danger: { container: 'bg-danger', label: 'text-text-inverse', spinner: color['text-inverse'] },
  };

// Heights sit at or above the 44pt minimum touch target.
const sizeStyles: Record<ButtonSize, { container: string; text: 'body' | 'bodyLg' }> = {
  sm: { container: 'min-h-[44px] px-4', text: 'body' },
  md: { container: 'min-h-[52px] px-5', text: 'body' },
  lg: { container: 'min-h-[60px] px-6', text: 'bodyLg' },
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label — typically an icon. */
  leading?: React.ReactNode;
  /**
   * Fires impact feedback on press. On by default: the primary Pro actions
   * (accept, arrived, complete) are performed one-handed, often in motion.
   */
  haptic?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  leading,
  haptic = true,
  disabled,
  onPress,
  className,
  ...rest
}: ButtonProps) {
  const styles = variantStyles[variant];
  const sizing = sizeStyles[size];
  const isDisabled = disabled === true || loading;

  const handlePress: PressableProps['onPress'] = (event) => {
    if (haptic) {
      // Feedback is a nicety; a failure here must never block the action.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      className={cn(
        'flex-row items-center justify-center rounded-lg active:opacity-80',
        styles.container,
        sizing.container,
        fullWidth ? 'w-full' : 'self-start',
        isDisabled && 'opacity-40',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={styles.spinner} />
      ) : (
        <>
          {leading ? <View className="mr-2">{leading}</View> : null}
          <Text variant={sizing.text} className={cn('font-semibold', styles.label)}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
