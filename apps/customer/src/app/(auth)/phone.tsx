import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Input, Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { openExternalUrl } from '@/utils/open-url';

export default function PhoneScreen() {
  const { sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [phone, setPhone] = useState('+91');
  const [localError, setLocalError] = useState<string | null>(null);

  usePhoneHint(setPhone, phone.trim() === '+91');

  async function onContinue() {
    setLocalError(null);
    clearError();

    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Enter a valid phone number.');
      return;
    }

    if (await sendCode(parsed.data)) {
      router.push({ pathname: '/verify', params: { phone: parsed.data } });
    }
  }

  return (
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <View className="flex-1 justify-center py-10">
        <Wordmark size="md" />

        <Text variant="titleLg" className="mt-10">
          Enter your phone number
        </Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          We&apos;ll text you a {OTP_LENGTH}-digit code to verify it&apos;s you.
        </Text>

        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          autoFocus
          editable={!isBusy}
          error={localError ?? error ?? undefined}
          hint="Include your country code."
          containerClassName="mt-8"
        />
      </View>

      <View className="gap-3 pb-4">
        <Button label="Send code" size="lg" loading={isBusy} onPress={() => void onContinue()} />
        <Text variant="caption" className="text-center">
          By continuing you agree to the SAMONA terms and privacy policy.
        </Text>
        <View className="flex-row justify-center gap-5">
          <Text
            variant="caption"
            className="text-brand"
            onPress={() =>
              openExternalUrl(
                TERMS_URL,
                'Could not open page',
                'Check your connection and try again.',
              )
            }
          >
            Terms of Service
          </Text>
          <Text
            variant="caption"
            className="text-brand"
            onPress={() =>
              openExternalUrl(
                PRIVACY_URL,
                'Could not open page',
                'Check your connection and try again.',
              )
            }
          >
            Privacy Policy
          </Text>
        </View>
      </View>
    </Screen>
  );
}
