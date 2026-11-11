import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { OTP_LENGTH } from '@samona/config';
import { AuthHero } from '@/components/auth';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import {
  useCountdown,
  useOtpAutoFill,
  usePhoneAuth,
  getAppHash,
  startOtpListening,
  stopOtpListening,
} from '@/hooks';

/** A code was just sent on the previous screen, so resend waits a full window. */
const RESEND_COOLDOWN_MS = 30_000;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [code, setCode] = useState('');
  const {
    remainingSeconds,
    isActive: isResendLocked,
    restart: restartResendWindow,
  } = useCountdown(RESEND_COOLDOWN_MS);

  /** True while a verification request is in flight. */
  const verifyingRef = useRef(false);
  /** The last code an automatic attempt fired for, so repeats are skipped. */
  const lastAutoAttemptRef = useRef<string | null>(null);

  // Android zero-tap fill via Google's SMS Retriever, armed on the phone
  // screen before the code was requested; iOS no-ops here and fills through
  // the keyboard's one-time-code suggestion instead. The retriever only
  // fires when the SMS contains this build's app hash, which must be
  // appended to the Supabase Auth SMS template. The callback fills the
  // field when the code lands — no effect, no manual state sync.
  useOtpAutoFill({
    length: OTP_LENGTH,
    onOtpReceived: (next) => {
      if (!next) return;
      clearError();
      setCode(next);
    },
  });

  useEffect(() => {
    if (__DEV__ && Platform.OS === 'android') {
      void getAppHash().then((hash) =>
        // eslint-disable-next-line no-console
        console.log('[verify] SMS Retriever app hash:', hash),
      );
    }
  }, []);

  /**
   * Verifies `token` against the phone number. Shared by the Verify button
   * and the automatic path; the in-flight lock means a second request can
   * never start while one is running.
   *
   * On success Supabase persists the session and emits an auth event; the
   * root layout observes that and routes into the app, so there is no manual
   * navigation here.
   */
  async function attemptVerify(token: string) {
    if (!phone || verifyingRef.current) return;
    verifyingRef.current = true;
    clearError();
    try {
      const signedIn = await verifyCode(phone, token);
      if (signedIn) {
        // The session is confirmed; the SMS listener's job is done.
        void stopOtpListening();
      }
    } finally {
      verifyingRef.current = false;
    }
  }

  /**
   * Auto-verifies as soon as the code is complete. Each distinct code fires
   * at most one request: `lastAutoAttemptRef` skips repeats of the same
   * digits (effect re-runs, an autofill re-delivery) and `verifyingRef`
   * blocks anything while a request is in flight. Editing the code or
   * resending clears both guards; the Verify button always allows a manual
   * retry of the same digits.
   */
  useEffect(() => {
    if (code.length !== OTP_LENGTH) return;
    if (verifyingRef.current || lastAutoAttemptRef.current === code) return;
    lastAutoAttemptRef.current = code;
    void attemptVerify(code);
    // Keys on the code alone; the guards above make repeat runs safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function onCodeChange(next: string) {
    clearError();
    // Editing the digits re-arms automatic verification for them.
    lastAutoAttemptRef.current = null;
    setCode(next);
  }

  async function onResend() {
    if (!phone || isResendLocked) return;
    clearError();
    // A fresh code invalidates the old one: clear the field, forget the last
    // attempt, and re-arm the retriever before the request goes out.
    setCode('');
    lastAutoAttemptRef.current = null;
    await startOtpListening();
    if (await sendCode(phone)) restartResendWindow();
  }

  return (
    /* No top safe-area edge: the hero's blue band runs edge-to-edge behind
       the status bar, like the welcome screen's background. */
    <Screen
      edges={['bottom']}
      scrollable
      keyboardAware
      className="bg-surface"
      footer={
        /* CTAs pinned below the scroll area: they ride above the keyboard
           while the code is being entered. */
        <View className="gap-3 pb-4 pt-6">
          <Button
            label="Verify"
            size="lg"
            loading={isBusy}
            disabled={code.length < OTP_LENGTH}
            onPress={() => void attemptVerify(code)}
          />
          <Button
            label={isResendLocked ? `Resend code in ${remainingSeconds}s` : 'Resend code'}
            variant="ghost"
            disabled={isBusy || isResendLocked}
            onPress={() => void onResend()}
          />
        </View>
      }
    >
      <StatusBar style="light" />
      <AuthHero />
      {/* Top-aligned under the hero instead of vertically centered: the
          boxes stay up near the hero, well clear of the pinned footer,
          which rides above the keyboard while the code is entered. */}
      <View className="flex-1 pt-6 pb-4">
        <Text variant="titleLg">Enter the code</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          Sent to {phone ?? 'your phone'}.{' '}
          <Text variant="body" className="text-brand" onPress={() => router.back()}>
            Change number
          </Text>
        </Text>

        {/* Breathing room below the boxes so the pinned CTA footer, which
            rides above the keyboard, stays clear of the field. */}
        <View className="mt-3">
          <OtpInput
            length={OTP_LENGTH}
            value={code}
            onChange={onCodeChange}
            editable={!isBusy}
            error={error ?? undefined}
          />
        </View>
      </View>
    </Screen>
  );
}
