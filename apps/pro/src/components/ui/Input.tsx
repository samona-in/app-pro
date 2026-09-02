import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Field-level message. Presence switches the field to its error styling. */
  error?: string;
  /** Guidance shown when there is no error. */
  hint?: string;
  /** Dark variant for the black/blue/white onboarding surface. */
  dark?: boolean;
  className?: string;
  containerClassName?: string;
}

/**
 * Text field with label, hint and error slots.
 *
 * Client-side validation messages surface through `error`; the server remains
 * the authority on whether a value is acceptable (CLAUDE.md "Validation").
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, dark = false, className, containerClassName, editable = true, ...rest },
  ref,
) {
  const hasError = Boolean(error);

  return (
    <View className={cn('w-full', containerClassName)}>
      {label ? (
        <Text variant="label" className={cn('mb-1.5', dark && 'text-white/70')}>
          {label}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor={dark ? 'rgba(255,255,255,0.35)' : color['text-muted']}
        accessibilityLabel={label}
        className={cn(
          'min-h-[52px] w-full rounded-xl border px-4 text-body',
          dark ? 'border-onboarding-border bg-onboarding-surface text-white' : 'border-border bg-surface text-text-primary',
          hasError && dark ? 'border-danger' : hasError ? 'border-danger' : dark ? 'border-onboarding-border' : 'border-border',
          !editable && (dark ? 'opacity-60' : 'bg-surface-muted text-text-secondary'),
          className,
        )}
        {...rest}
      />

      {hasError ? (
        <Text variant="footnote" className={cn('mt-1.5', dark ? 'text-red-400' : 'text-danger')}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" className={cn('mt-1.5', dark && 'text-white/50')}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
