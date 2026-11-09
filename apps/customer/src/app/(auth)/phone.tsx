import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { Button, Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { openExternalUrl } from '@/utils/open-url';

const DEFAULT_DIAL_CODE = '+91';

/** The market is fixed to +91, so a mobile number is always ten digits. */
const LOCAL_NUMBER_DIGITS = 10;

/** The reference form keeps the label italic, like a deliberate preference. */
const REMEMBER_LABEL = 'Remember my login for faster sign-in';

function digitsOf(value: string) {
  return value.replace(/\D/g, '');
}

/**
 * India's tricolour, drawn from views rather than an emoji: flag emoji render
 * as plain "IN" letters on several Android builds, which would leave the
 * country box looking broken.
 */
function IndiaFlag() {
  return (
    <View
      accessible={false}
      style={{ width: 26, height: 18 }}
      className="overflow-hidden rounded-[3px] border border-border"
    >
      <View style={{ flex: 1, backgroundColor: '#FF9933' }} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <View
          style={{
            height: 6,
            width: 6,
            borderRadius: 3,
            borderWidth: 1,
            borderColor: '#000080',
          }}
        />
      </View>
      <View style={{ flex: 1, backgroundColor: '#138808' }} />
    </View>
  );
}

/** A quiet legal link: dark label, dotted rule underneath, like the reference. */
function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() =>
        openExternalUrl(url, 'Could not open page', 'Check your connection and try again.')
      }
      className="border-b border-dotted border-text-muted pb-0.5 active:opacity-60"
    >
      <Text variant="footnote" className="font-medium text-text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

export default function PhoneScreen() {
  const { sendCode, isBusy, error, clearError } = usePhoneAuth();
  const dialCode = DEFAULT_DIAL_CODE;
  const [number, setNumber] = useState('');
  const [remember, setRemember] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // The hint arrives as a single E.164 string, so strip the dial code we already
  // show and keep only the subscriber number. The default market is +91.
  usePhoneHint(
    (hint) => {
      const digits = digitsOf(hint);
      const code = digitsOf(dialCode);
      if (digits.startsWith(code))
        setNumber(digits.slice(code.length, code.length + LOCAL_NUMBER_DIGITS));
    },
    number.length === 0 && dialCode === DEFAULT_DIAL_CODE,
  );

  function onNumberChange(text: string) {
    setNumber(digitsOf(text).slice(0, LOCAL_NUMBER_DIGITS));
  }

  async function onContinue() {
    setLocalError(null);
    clearError();

    const local = digitsOf(number);

    if (!local) {
      setLocalError('Enter your phone number.');
      return;
    }

    if (local.length !== LOCAL_NUMBER_DIGITS) {
      setLocalError(`Enter a ${LOCAL_NUMBER_DIGITS}-digit phone number.`);
      return;
    }

    const parsed = phoneSchema.safeParse(`${dialCode}${local}`);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Enter a valid phone number.');
      return;
    }

    if (await sendCode(parsed.data)) {
      router.push({ pathname: '/verify', params: { phone: parsed.data } });
    }
  }

  const hasError = Boolean(localError ?? error);

  return (
    <Screen edges={['top', 'bottom']} scrollable className="bg-surface">
      <View className="flex-1 justify-center py-10">
        <Text variant="titleLg" className="text-center">
          Log in or sign up
        </Text>
        <Text variant="footnote" className="mt-2 text-center">
          We&apos;ll text you a {OTP_LENGTH}-digit code to verify it&apos;s you.
        </Text>

        {/* ── Phone row ─────────────────────────────────────────────────── */}
        <View className="mt-8 flex-row gap-3">
          {/* The market is fixed to India, so the country box is a label, not
              a picker: the +91 prefix below can never drift from it. */}
          <View
            accessible
            accessibilityLabel="India, plus 91"
            className="h-14 w-16 items-center justify-center rounded-lg border border-border bg-surface"
          >
            <IndiaFlag />
          </View>

          <View
            className={cn(
              'h-14 flex-1 flex-row items-center rounded-lg border bg-surface pl-4 pr-3',
              hasError ? 'border-danger' : 'border-border',
            )}
          >
            <Text
              variant="bodyLg"
              className="font-bold leading-6 text-text-primary"
              style={{ includeFontPadding: false }}
            >
              {dialCode}
            </Text>
            <TextInput
              value={number}
              onChangeText={onNumberChange}
              placeholder="Enter Phone Number"
              placeholderTextColor={color['text-muted']}
              accessibilityLabel="Phone number"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              textAlignVertical="center"
              maxLength={LOCAL_NUMBER_DIGITS}
              autoFocus
              editable={!isBusy}
              style={{ includeFontPadding: false, paddingVertical: 0 }}
              className="ml-3 h-full min-w-0 flex-1 bg-transparent text-body-lg leading-6 text-text-primary"
            />
          </View>
        </View>

        {hasError ? (
          <Text variant="footnote" className="mt-1.5 text-danger">
            {localError ?? error}
          </Text>
        ) : null}

        {/* ── Remember me ───────────────────────────────────────────────── */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={REMEMBER_LABEL}
          accessibilityState={{ checked: remember }}
          onPress={() => setRemember((value) => !value)}
          className="mt-4 flex-row items-center py-1 active:opacity-70"
        >
          <View
            className={cn(
              'h-[22px] w-[22px] items-center justify-center rounded-[6px] border-2',
              remember ? 'border-brand bg-brand' : 'border-border-strong bg-surface',
            )}
          >
            {remember ? (
              <Ionicons name="checkmark" size={14} color={color['brand-contrast']} />
            ) : null}
          </View>
          <Text className="ml-3 flex-1 text-[15px] italic text-text-secondary">
            {REMEMBER_LABEL}
          </Text>
        </Pressable>

        <Button
          label="Continue"
          size="lg"
          className="mt-6"
          loading={isBusy}
          onPress={() => void onContinue()}
        />

        {/* ── Legal, tucked directly under the CTA ─────────────────────── */}
        <View className="mt-5">
          <Text variant="footnote" className="text-center text-text-secondary">
            By continuing, you agree to our
          </Text>
          <View className="mt-2 flex-row flex-wrap justify-center gap-x-5 gap-y-2">
            <LegalLink label="Terms of Service" url={TERMS_URL} />
            <LegalLink label="Privacy Policy" url={PRIVACY_URL} />
          </View>
        </View>
      </View>
    </Screen>
  );
}
