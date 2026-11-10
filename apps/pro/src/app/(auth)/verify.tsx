import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { AuthHero } from '@/components/auth';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import { useCountdown, useOtpAutoFill, usePhoneAuth, getAppHash } from '@/hooks';

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

  // Android zero-tap fill via Google's SMS Retriever; iOS/web no-op.
  // The retriever only fires when the SMS ends with this build's hash,
  // which must be appended to the Supabase Auth SMS template. The callback
  // fills the field when the code lands — no effect, no manual state sync.
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

  async function onVerify() {
    if (!phone) return;
    clearError();
    await verifyCode(phone, code);
  }

  async function onResend() {
    if (!phone || isResendLocked) return;
    clearError();
    setCode('');
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
            onPress={() => void onVerify()}
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
            onChange={(next) => {
              clearError();
              setCode(next);
            }}
            editable={!isBusy}
            error={error ?? undefined}
          />
        </View>
      </View>
    </Screen>
  );
}
