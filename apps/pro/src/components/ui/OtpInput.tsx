import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { Text } from './Text';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

export interface OtpInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  /** Field-level message. Presence switches the boxes to their error styling. */
  error?: string;
  editable?: boolean;
  /** Box corner radius; squares are 0. */
  radius?: number;
  /**
   * Bump this value to imperatively re-focus the input. Needed inside native
   * modal sheets where the field is already mounted (unseen) and `autoFocus`
   * has long passed by the time the sheet presents.
   */
  focusKey?: number;
}

/**
 * Split one-time-code entry as a row of individual square boxes.
 * A single hidden TextInput holds focus and drives the visible boxes, so
 * hardware keyboard, SMS auto-fill, paste and autofocus all just work.
 */
export function OtpInput({
  length,
  value,
  onChange,
  error,
  editable = true,
  radius = 0,
  focusKey = 0,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const hasError = Boolean(error);
  const chars = value.split('');

  // A bump in `focusKey` re-requests the keyboard. Mount-time `autoFocus` alone
  // is lost when the field renders inside a native sheet that starts closed.
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
      <View
        className="relative flex-row justify-between"
        accessibilityLabel="Verification code"
      >
        {Array.from({ length }, (_, i) => (
          <Pressable key={i} onPress={() => inputRef.current?.focus()}>
            <View
              className={cn(
                'h-[56px] w-[48px] items-center justify-center border-2 bg-surface',
                i < chars.length || (i === value.length && focused)
                  ? 'border-brand'
                  : hasError
                    ? 'border-danger'
                    : 'border-border-strong',
              )}
              style={{ borderRadius: radius }}
            >
              <Text variant="title" className={cn('text-text-primary', i >= chars.length && 'opacity-0')}>
                {chars[i] ?? ' '}
              </Text>
            </View>
          </Pressable>
        ))}

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
          // An invisible overlay covering the boxes, not an off-screen 0x0 node:
          // a sheet-hosted input with no visible bounds (and no bounding box for
          // IOS while the sheet presents) will not become first responder, so the
          // keyboard never appears. `opacity-0` keeps it hit-testable and
          // focusable while staying invisible.
          className="absolute inset-0 opacity-0"
          accessibilityLabel="Verification code"
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
