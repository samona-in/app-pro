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
  { label, error, hint, className, containerClassName, editable = true, ...rest },
  ref,
) {
  const hasError = Boolean(error);

  return (
    <View className={cn('w-full', containerClassName)}>
      {label ? (
        <Text variant="label" className="mb-1.5">
          {label}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor={color['text-muted']}
        accessibilityLabel={label}
        className={cn(
          'min-h-[52px] w-full rounded-lg border bg-surface px-4 text-body text-text-primary',
          hasError ? 'border-danger' : 'border-border',
          !editable && 'bg-surface-muted text-text-secondary',
          className,
        )}
        {...rest}
      />

      {hasError ? (
        <Text variant="footnote" className="mt-1.5 text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" className="mt-1.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
