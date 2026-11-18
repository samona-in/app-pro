import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { AuthHero } from '@/components/auth';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import { useCountdown, usePhoneAuth } from '@/hooks';

/** A code was just sent on the previous screen, so resend waits a full window. */
const RESEND_COOLDOWN_MS = 30_000;

/**
 * Step 2 of phone authentication: verify the code.
 *
 * On success Supabase persists the session and emits an auth event; the root
 * layout observes that and routes into the app, so there is no manual
 * navigation to the tabs here.
 */
export default function VerifyScreen() {
  const { t } = useTranslation();
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

  /**
   * Verifies `token` against the phone number. Shared by the Verify button
   * and the automatic path; the in-flight lock means a second request can
   * never start while one is running.
   */
  async function attemptVerify(token: string) {
    if (!phone || verifyingRef.current) return;
    verifyingRef.current = true;
    clearError();
    try {
      await verifyCode(phone, token);
    } finally {
      verifyingRef.current = false;
    }
  }

  /**
   * Auto-verifies as soon as the code is complete. Each distinct code fires
   * at most one request: `lastAutoAttemptRef` skips repeats of the same
   * digits and `verifyingRef` blocks anything while a request is in flight.
   * Editing the code or resending clears both guards; the Verify button
   * always allows a manual retry of the same digits.
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
    // A fresh code invalidates the old one: clear the field and forget the
    // last attempt so the new digits can auto-verify.
    setCode('');
    lastAutoAttemptRef.current = null;
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
            label={t('verify.verify')}
            size="lg"
            loading={isBusy}
            disabled={code.length < OTP_LENGTH}
            onPress={() => void attemptVerify(code)}
          />
          <Button
            label={
              isResendLocked
                ? t('verify.resendIn', { seconds: remainingSeconds })
                : t('verify.resendCode')
            }
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
      <View className="flex-1 pb-4 pt-6">
        <Text variant="titleLg">{t('verify.heading')}</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          {t('verify.sentToPhone', { phone: phone ?? t('verify.yourPhone') })}{' '}
          <Text variant="body" className="text-brand" onPress={() => router.back()}>
            {t('verify.changeNumber')}
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
