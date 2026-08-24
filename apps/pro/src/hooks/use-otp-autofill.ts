import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type OtpAutofillModule = {
  getAppHashAsync(): Promise<string>;
  startSmsRetrieverAsync(): Promise<boolean>;
  stopSmsRetrieverAsync(): Promise<void>;
  addListener(
    eventName: 'onOtpReceived',
    listener: (event: { message: string }) => void,
  ): { remove(): void };
};

/**
 * The package evaluates its native module while its JS loads, so a static
 * import crashes every environment without the compiled side (Expo Go, iOS).
 * Loading lazily lets sign-in fall back to manual entry instead.
 */
function loadOtpAutofillModule(): OtpAutofillModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-otp-autofill') as OtpAutofillModule;
  } catch {
    return null;
  }
}

/** Pulls the OTP digits out of a provider SMS body; null when absent. */
export function extractOtpCode(message: string, length: number): string | null {
  const keywordFirst = new RegExp(
    `(?:code|otp|passcode|password)\\D{0,16}(\\d{${length}})`,
    'i',
  );
  const bare = new RegExp(`(?<!\\d)(\\d{${length}})(?!\\d)`);
  return message.match(keywordFirst)?.[1] ?? message.match(bare)?.[1] ?? null;
}

/**
 * Android zero-tap OTP capture via Google's SMS Retriever. Safe no-op where
 * the native side is missing; the SMS must end with this build's app hash
 * (see getAppHash) or Play Services will not deliver it.
 */
export function useOtpAutoFill(options?: { length?: number }): {
  otp: string | null;
} {
  const length = options?.length ?? 6;
  const [otp, setOtp] = useState<string | null>(null);

  useEffect(() => {
    const mod = loadOtpAutofillModule();
    if (!mod || Platform.OS !== 'android') return;

    const subscription = mod.addListener('onOtpReceived', ({ message }) => {
      setOtp(extractOtpCode(message, length));
    });
    mod.startSmsRetrieverAsync().catch(() => {
      // Retriever needs Play Services; one-tap autofill props still apply.
    });

    return () => {
      subscription.remove();
      void mod.stopSmsRetrieverAsync();
    };
  }, [length]);

  return { otp };
}

/** This signing key's 11-char hash for the Supabase SMS template; '' if unavailable. */
export async function getAppHash(): Promise<string> {
  const module = loadOtpAutofillModule();
  if (!module || Platform.OS !== 'android') return '';
  try {
    return await module.getAppHashAsync();
  } catch {
    return '';
  }
}
