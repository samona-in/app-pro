import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type * as PhoneNumberHintTypes from 'expo-phone-number-hint';

/** Lets the navigation transition finish before the system sheet appears. */
export const PHONE_HINT_DELAY_MS = 750;

type HintModule = typeof PhoneNumberHintTypes;

/**
 * Resolves the hint module on first use rather than at import time.
 *
 * The package's JS calls `requireNativeModule` while evaluating, so a static
 * import throws in any environment without the compiled native side — Expo Go,
 * or an iOS dev build — and takes every route down with it. Requiring lazily
 * keeps that failure inside this one guarded call, and the app degrades to
 * manual number entry instead.
 */
function loadHintModule(): HintModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-phone-number-hint') as HintModule;
  } catch {
    return null;
  }
}

/**
 * Offers the Android Phone Number Hint sheet — the same SIM-number picker
 * Swiggy, Zomato and Rapido show when the phone screen opens.
 *
 * Powered by Google Play Services' hint API, which deliberately requires **no
 * permission**: the device never discloses a number until the user taps one
 * (CLAUDE.md "Location"'s explain-before-requesting rule is therefore not
 * triggered — there is nothing to authorise). iOS has no equivalent public
 * API, so the hook simply does nothing there.
 *
 * The sheet shows once per mount, and only while `isEnabled` holds (the Pro has
 * not started typing). Every failure path — no Play Services, dismissed picker,
 * missing native module under Expo Go — degrades to plain typing.
 */
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
          // A failed hint must never block sign-in; the field works by hand.
          // Expected under Expo Go / iOS (no compiled native side), so keep
          // this off LogBox — a plain breadcrumb for debugging only.
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
