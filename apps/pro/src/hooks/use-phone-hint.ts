
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

export function usePhoneHint(
  onPick: (e164: string) => void,
  isEnabled: boolean,
) {
  const onPickRef = useRef(onPick);
  const hasPrompted = useRef(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !isEnabled ||
      hasPrompted.current
    ) {
      return;
    }

    hasPrompted.current = true;

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const hint = loadHintModule();

          if (!hint) return;

          const available = await hint.isAvailableAsync();

          if (!available || cancelled) return;

          const result = await hint.showPhoneNumberHintAsync();

          if (cancelled || result.canceled) return;

          const suggestion =
            result.hint?.e164 ?? result.hint?.number;

          if (suggestion) {
            onPickRef.current(suggestion);
          }
        } catch (error) {
          if (__DEV__ && !cancelled) {
            console.warn(
              '[usePhoneHint] unavailable:',
              error instanceof Error ? error.message : error,
            );
          }
        }
      })();
    }, PHONE_HINT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isEnabled]);
}
