import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Input, Screen, Text } from '@/components/ui';
import { usePhoneAuth } from '@/hooks';

const CODE_LENGTH = 6;

/**
 * Step 2 of phone authentication: verify the code.
 *
 * On success Clerk activates the session; the root layout observes that and
 * routes into the app, so there is no manual navigation to the tabs here.
 */
export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyCode, sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [code, setCode] = useState('');

  async function onVerify() {
    clearError();
    await verifyCode(code);
  }

  async function onResend() {
    clearError();
    setCode('');
    if (phone) await sendCode(phone);
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

        <Input
          label="Verification code"
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={CODE_LENGTH}
          autoFocus
          editable={!isBusy}
          error={error ?? undefined}
          containerClassName="mt-8"
          className="text-title tracking-[8px]"
        />
      </View>

      <View className="gap-3 pb-4">
        <Button
          label="Verify"
          size="lg"
          loading={isBusy}
          disabled={code.length < CODE_LENGTH}
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
