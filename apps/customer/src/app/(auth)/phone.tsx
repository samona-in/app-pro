import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { openExternalUrl } from '@/utils/open-url';

const DEFAULT_DIAL_CODE = '+91';

/** Local numbers never carry the dial code; maxLength keeps typos honest. */
const MAX_LOCAL_DIGITS = 12;

function digitsOf(value: string) {
  return value.replace(/\D/g, '');
}

export default function PhoneScreen() {
  const { sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [number, setNumber] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // The hint arrives as a single E.164 string, so strip the dial code we already
  // show and keep only the subscriber number. The default market is +91.
  usePhoneHint(
    (hint) => {
      const digits = digitsOf(hint);
      const code = digitsOf(dialCode);
      if (digits.startsWith(code)) setNumber(digits.slice(code.length));
    },
    number.length === 0 && dialCode === DEFAULT_DIAL_CODE,
  );

  function onDialCodeChange(text: string) {
    setDialCode(`+${digitsOf(text).slice(0, 3)}`);
  }

  function onNumberChange(text: string) {
    setNumber(digitsOf(text).slice(0, MAX_LOCAL_DIGITS));
  }

  async function onContinue() {
    setLocalError(null);
    clearError();

    const code = digitsOf(dialCode);
    const local = digitsOf(number);

    if (!code) {
      setLocalError('Enter your country code.');
      return;
    }

    if (!local) {
      setLocalError('Enter your phone number.');
      return;
    }

    const parsed = phoneSchema.safeParse(`+${code}${local}`);
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

        <View className="mt-8">
          {/* One field, two inputs: the dial code and the subscriber number share
              a single outline, separated by a hairline instead of two borders. */}
          <View
            className={cn(
              'flex-row items-stretch rounded-lg border bg-surface',
              localError ?? error ? 'border-danger' : 'border-border',
            )}
          >
            <TextInput
              value={dialCode}
              onChangeText={onDialCodeChange}
              placeholder="+91"
              placeholderTextColor={color['text-muted']}
              accessibilityLabel="Country code"
              keyboardType="phone-pad"
              maxLength={4}
              editable={!isBusy}
              className="min-h-[52px] w-[76px] rounded-l-lg px-2 text-center text-body font-bold text-text-primary"
            />
            <View className="my-3 w-px bg-border" />
            <TextInput
              value={number}
              onChangeText={onNumberChange}
              placeholder="98765 43210"
              placeholderTextColor={color['text-muted']}
              accessibilityLabel="Phone number"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={MAX_LOCAL_DIGITS}
              autoFocus
              editable={!isBusy}
              className="min-h-[52px] flex-1 rounded-r-lg px-4 text-body font-bold text-text-primary"
            />
          </View>

          {localError ?? error ? (
            <Text variant="footnote" className="mt-1.5 text-danger">
              {localError ?? error}
            </Text>
          ) : null}
        </View>
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
