import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonShape = 'default' | 'pill';

/**
 * Label and spinner colours come straight from tokens rather than Tailwind
 * classes: `<Text variant>` already sets a text colour, and NativeWind resolves
 * competing colour utilities by stylesheet order, not className order — so a
 * class-based override silently loses and labels render invisible on brand
 * backgrounds.
 */
const variantStyles: Record<ButtonVariant, { container: string; labelColor: string }> = {
  primary: { container: 'bg-brand', labelColor: color['brand-contrast'] },
  secondary: {
    container: 'bg-surface border border-border-strong',
    labelColor: color['text-primary'],
  },
  ghost: { container: 'bg-transparent', labelColor: color['text-primary'] },
  success: { container: 'bg-success', labelColor: color['text-inverse'] },
  danger: { container: 'bg-danger', labelColor: color['text-inverse'] },
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
  /** `pill` renders the fully-rounded CTA used across onboarding. */
  shape?: ButtonShape;
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
  shape = 'default',
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
        'flex-row items-center justify-center active:opacity-80',
        shape === 'pill' ? 'rounded-full' : 'rounded-lg',
        styles.container,
        sizing.container,
        fullWidth ? 'w-full' : 'self-start',
        isDisabled && 'opacity-40',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={styles.labelColor} />
      ) : (
        <>
          {leading ? <View className="mr-2">{leading}</View> : null}
          <Text
            variant={sizing.text}
            className="font-semibold"
            style={{ color: styles.labelColor }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
