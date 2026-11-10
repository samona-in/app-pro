import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { OTP_LENGTH } from '@samona/config';
import { AuthHero } from '@/components/auth';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import { useCountdown, useOtpAutoFill, usePhoneAuth, getAppHash } from '@/hooks';

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

  const { otp } = useOtpAutoFill({ length: OTP_LENGTH });

  useEffect(() => {
    if (!otp) return;
    clearError();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  useEffect(() => {
    if (__DEV__ && Platform.OS === 'android') {
      void getAppHash().then((hash) => console.log('[verify] SMS Retriever app hash:', hash));
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
            label="Verify"
            size="lg"
            loading={isBusy}
            disabled={code.length < OTP_LENGTH}
            onPress={() => void onVerify()}
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
