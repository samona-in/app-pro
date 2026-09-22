import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import { useOtpAutoFill, usePhoneAuth, getAppHash } from '@/hooks';
import { env } from '@/env';

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
    if (!phone) return;
    clearError();
    setCode('');
    await sendCode(phone);
  }

  return (
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <View className="flex-1 justify-center py-10">
        <Text variant="titleLg">{t('verify.heading')}</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          {t('verify.sentToPhone', { phone: phone ?? t('verify.yourPhone') })}{' '}
          <Text variant="body" className="text-brand" onPress={() => router.back()}>
            {t('verify.changeNumber')}
          </Text>
        </Text>

        <OtpInput
          length={OTP_LENGTH}
          value={code}
          onChange={(next) => setCode(next)}
          editable={!isBusy}
          error={error ?? undefined}
        />
      </View>

      {env.authTestOtp ? (
        <View className="mb-2 gap-2">
          <Text variant="caption" className="text-center text-text-secondary">
            {t('verify.devNoSms')}
          </Text>
          <Button
            label={t('verify.devUseTestCode', { code: env.authTestOtp })}
            variant="ghost"
            disabled={isBusy}
            onPress={() => {
              clearError();
              setCode(env.authTestOtp ?? '');
            }}
          />
        </View>
      ) : null}

      <View className="gap-3 pb-4">
        <Button
          label={t('verify.verify')}
          size="lg"
          loading={isBusy}
          disabled={code.length < OTP_LENGTH}
          onPress={() => void onVerify()}
        />
        <Button
          label={t('verify.resendCode')}
          variant="ghost"
          disabled={isBusy}
          onPress={() => void onResend()}
        />
      </View>
    </Screen>
  );
}
