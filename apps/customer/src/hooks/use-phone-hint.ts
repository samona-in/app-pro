import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type * as PhoneNumberHintTypes from 'expo-phone-number-hint';

export const PHONE_HINT_DELAY_MS = 750;

type HintModule = typeof PhoneNumberHintTypes;

function loadHintModule(): HintModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-phone-number-hint') as HintModule;
  } catch {
    return null;
  }
}

export function usePhoneHint(onPick: (e164: string) => void, isEnabled: boolean) {
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  const hasPrompted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isEnabled || hasPrompted.current) {
      return;
    }
    hasPrompted.current = true;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const hint = loadHintModule();
          if (!hint || !(await hint.isAvailableAsync())) return;

          const result = await hint.showPhoneNumberHintAsync();
          const suggestion = result.hint ? (result.hint.e164 ?? result.hint.number) : null;
          if (!result.canceled && suggestion) {
            onPickRef.current(suggestion);
          }
        } catch (error) {
          console.log(
            '[usePhoneHint] unavailable:',
            error instanceof Error ? error.message : error,
          );
        }
      })();
    }, PHONE_HINT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isEnabled]);
}
