import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { phoneSchema } from '@samona/validation';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Input, Screen, Text } from '@/components/ui';
import { usePhoneAuth } from '@/hooks';

/**
 * Step 1 of phone authentication: collect the number.
 *
 * Client-side validation is a UX convenience only — Clerk validates the number
 * and owns delivery of the code (CLAUDE.md "Validation").
 */
export default function PhoneScreen() {
  const { sendCode, isBusy, isLoaded, error, clearError } = usePhoneAuth();
  const [phone, setPhone] = useState('+91');
  const [localError, setLocalError] = useState<string | null>(null);

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
          We&apos;ll text you a six-digit code to verify it&apos;s you.
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
        <Button
          label="Send code"
          size="lg"
          loading={isBusy}
          disabled={!isLoaded}
          onPress={() => void onContinue()}
        />
        <Text variant="caption" className="text-center">
          By continuing you agree to the SAMONA Pro terms and privacy policy.
        </Text>
      </View>
    </Screen>
  );
}
