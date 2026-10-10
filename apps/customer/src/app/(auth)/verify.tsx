import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { OTP_LENGTH } from '@samona/config';
import { Button, OtpInput, Screen, Text } from '@/components/ui';
import { useOtpAutoFill, usePhoneAuth, getAppHash } from '@/hooks';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [code, setCode] = useState('');

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
    if (!phone) return;
    clearError();
    setCode('');
    await sendCode(phone);
  }

  return (
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <View className="flex-1 justify-center py-10">
        <Text variant="titleLg">Enter the code</Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          Sent to {phone ?? 'your phone'}.{' '}
          <Text variant="body" className="text-brand" onPress={() => router.back()}>
            Change number
          </Text>
        </Text>

        <View className="mt-8">
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

      <View className="gap-3 pb-4">
        <Button
          label="Verify"
          size="lg"
          loading={isBusy}
          disabled={code.length < OTP_LENGTH}
          onPress={() => void onVerify()}
        />
        <Button
          label="Resend code"
          variant="ghost"
          disabled={isBusy}
          onPress={() => void onResend()}
        />
      </View>
    </Screen>
  );
}
