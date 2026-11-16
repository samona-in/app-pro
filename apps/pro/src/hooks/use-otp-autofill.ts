import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type OtpAutofillModule = {
  getAppHashAsync(): Promise<string>;
  startSmsRetrieverAsync(): Promise<boolean>;
  stopSmsRetrieverAsync(): Promise<void>;
  addListener(
    eventName: 'onOtpReceived' | 'onOtpError',
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
  const keywordFirst = new RegExp(`(?:code|otp|passcode|password)\\D{0,16}(\\d{${length}})`, 'i');
  const bare = new RegExp(`(?<!\\d)(\\d{${length}})(?!\\d)`);
  return message.match(keywordFirst)?.[1] ?? message.match(bare)?.[1] ?? null;
}

/* ─── Retriever bus ──────────────────────────────────────────────────────────
 *
 * Google's SMS Retriever only captures a message while an arm is active, and
 * each arm catches exactly one SMS (or times out after five minutes). Arming
 * from the verify screen alone leaves a gap: the code is requested on the
 * phone screen, so the SMS can arrive before the verify screen arms.
 *
 * Listening is therefore process-wide rather than per-screen: the phone
 * screen arms the retriever before the code is requested, the native
 * listener survives the transition into the verify screen, and every
 * `useOtpAutoFill` subscribes to the same captured message. The bus is what
 * keeps state across screens; the hook below only reads it.
 */

/** Hook subscribers, notified whenever a fresh SMS body lands. */
const busListeners = new Set<(message: string | null) => void>();

/** The last SMS body the bus captured; null before the first one. */
let lastMessage: string | null = null;
/** When that message was captured, in ms since the epoch. */
let lastMessageAt = 0;
/** When the retriever was last armed, in ms; 0 while listening is stopped. */
let primedAt = 0;
/** Set once the process-wide listeners are installed on the native module. */
let busInstalled = false;

function notifyBusListeners(message: string | null) {
  for (const listener of [...busListeners]) {
    try {
      listener(message);
    } catch {
      // A broken subscriber must not stop the others from receiving.
    }
  }
}

/**
 * Re-arms the retriever so a follow-up SMS — a resend — is still caught.
 * No-op unless the bus is listening: a stopped bus stays stopped.
 */
function rearmIfPrimed(mod: OtpAutofillModule) {
  if (primedAt === 0) return;
  mod.startSmsRetrieverAsync().catch(() => {
    // Retriever needs Play Services; manual entry still works.
  });
}

function installBus(mod: OtpAutofillModule) {
  if (busInstalled) return;
  busInstalled = true;

  mod.addListener('onOtpReceived', ({ message }) => {
    lastMessage = message;
    lastMessageAt = Date.now();
    notifyBusListeners(message);
    // This arm just consumed its one SMS; renew it for a possible resend.
    rearmIfPrimed(mod);
  });

  mod.addListener('onOtpError', () => {
    // Play Services gave up waiting (its five-minute timeout); renew the
    // window unless listening was stopped meanwhile.
    rearmIfPrimed(mod);
  });
}

/**
 * Arms Google's SMS Retriever — zero SMS permissions, Play Services does the
 * listening — and remembers when. Call it before the code is requested so the
 * message cannot beat the listener. Safe to call repeatedly (the native side
 * re-registers); no-op off Android.
 */
export async function startOtpListening(): Promise<void> {
  const mod = loadOtpAutofillModule();
  if (!mod || Platform.OS !== 'android') return;

  try {
    installBus(mod);
  } catch {
    // Registering the process-wide listeners failed (e.g. the native side is
    // missing). Autofill is a convenience, so never fail the sign-in request
    // over it — manual entry still works.
    return;
  }

  primedAt = Date.now();
  try {
    await mod.startSmsRetrieverAsync();
  } catch {
    // Retriever needs Play Services; manual entry still works.
  }
}

/**
 * Stops listening: the current arm is dropped and any cached message stops
 * counting as fresh, so a later screen cannot fill a stale code.
 */
export async function stopOtpListening(): Promise<void> {
  primedAt = 0;
  const mod = loadOtpAutofillModule();
  if (!mod || Platform.OS !== 'android') return;
  try {
    await mod.stopSmsRetrieverAsync();
  } catch {
    // Already stopped, or Play Services is unavailable; nothing to do.
  }
}

/**
 * Android zero-tap OTP capture via Google's SMS Retriever, reading the bus
 * above. Safe no-op where the native side is missing; the SMS must contain
 * this build's app hash (see getAppHash) or Play Services will not deliver it.
 */
export function useOtpAutoFill(options?: {
  length?: number;
  /** Fired with the extracted code as it lands, so callers can fill a field. */
  onOtpReceived?: (code: string | null) => void;
}): { otp: string | null } {
  const length = options?.length ?? 6;
  const [otp, setOtp] = useState<string | null>(null);

  // Refs keep the latest callback and length without re-subscribing on
  // every render.
  const onOtpReceivedRef = useRef(options?.onOtpReceived);
  const lengthRef = useRef(length);

  useEffect(() => {
    onOtpReceivedRef.current = options?.onOtpReceived;
    lengthRef.current = length;
  }, [options?.onOtpReceived, length]);

  useEffect(() => {
    const mod = loadOtpAutofillModule();
    if (!mod || Platform.OS !== 'android') return;

    const deliver = (message: string | null) => {
      const code = message === null ? null : extractOtpCode(message, lengthRef.current);
      setOtp(code);
      onOtpReceivedRef.current?.(code);
    };

    busListeners.add(deliver);

    // Arriving on the verify screen without the phone screen (a deep link)
    // leaves nobody to arm the retriever, so the hook arms it itself.
    if (primedAt === 0) void startOtpListening();

    // A message the bus caught while no hook was mounted is still useful, but
    // only when it arrived after the retriever was armed: anything older
    // belongs to a listening session this screen never started.
    if (primedAt > 0 && lastMessage !== null && lastMessageAt >= primedAt) {
      deliver(lastMessage);
    }

    return () => {
      busListeners.delete(deliver);
      // Leaving the screen ends the listening session, so the retriever stops
      // consuming messages in the background. The phone screen re-arms it
      // before the next code request.
      void stopOtpListening();
    };
    // The subscription is deliberately installed once for the screen's
    // lifetime: everything it reads is module-level or held in refs.
  }, []);

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
