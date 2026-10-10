import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { Text } from './Text';
import { color, cornerRadius } from '@/theme';
import { cn } from '@/utils/cn';

export interface OtpInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  /** Field-level message. Presence switches the boxes to their error styling. */
  error?: string;
  editable?: boolean;
  accessibilityLabel?: string;
  /**
   * Bump this value to imperatively re-focus the input. Needed inside native
   * modal sheets where the field is already mounted (unseen) and `autoFocus`
   * has long passed by the time the sheet presents.
   */
  focusKey?: number;
}

/**
 * One-time-code entry as a row of individual boxes.
 *
 * A single hidden TextInput holds focus and drives the visible boxes, so
 * hardware keyboards, SMS auto-fill, paste and autofocus all work without
 * hand-rolling per-cell focus management.
 */
export function OtpInput({
  length,
  value,
  onChange,
  error,
  editable = true,
  accessibilityLabel = 'Verification code',
  focusKey = 0,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const hasError = Boolean(error);
  const chars = value.split('');

  useEffect(() => {
    if (focusKey > 0) inputRef.current?.focus();
  }, [focusKey]);

  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <View className="w-full">
      <View className="relative flex-row gap-2" accessibilityLabel={accessibilityLabel}>
        {Array.from({ length }, (_, i) => {
          const active = i < chars.length || (i === value.length && focused);
          return (
            <Pressable key={i} className="flex-1" onPress={() => inputRef.current?.focus()}>
              <View
                className={cn(
                  'h-[72px] items-center justify-center border-2 bg-surface',
                  active ? 'border-brand' : hasError ? 'border-danger' : 'border-border-strong',
                )}
                style={{ borderRadius: cornerRadius.lg }}
              >
                <Text
                  variant="title"
                  className={cn('text-text-primary', i >= chars.length && 'opacity-0')}
                >
                  {chars[i] ?? ' '}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, length))}
          onKeyPress={onKeyPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={length}
          autoFocus
          editable={editable}
          caretHidden
          selection={{ start: value.length, end: value.length }}
          // Invisible overlay that owns the real input, rather than an off-screen
          // 0x0 node: a field with no visible bounds never becomes first responder
          // on iOS, so the keyboard would never appear. `opacity-0` keeps it
          // hit-testable and focusable while staying invisible.
          className="absolute inset-0 opacity-0"
          accessibilityLabel={accessibilityLabel}
          placeholderTextColor={color['text-muted']}
        />
      </View>

      {hasError ? (
        <Text variant="footnote" className="mt-2 text-center text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
