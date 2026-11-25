import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { AuthHero, CountryCodeButton, CountryPickerSheet } from '@/components/auth';
import { Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { DEFAULT_COUNTRY, type Country } from '@/constants/countries';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { openExternalUrl } from '@/utils/open-url';
import { toLocalDigits } from '@/utils/phone';

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
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Keeps the CTA busy until `sendCode` owns the hook's busy state. */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Synchronous guard: state updates land a render too late to stop a double tap. */
  const submittingRef = useRef(false);

  // The hint arrives as a single E.164 string for the SIM's own number, which
  // may belong to a different country than the one selected. Only adopt it
  // when it matches the dial code on screen, then strip that code and any
  // trunk zero like typed input.
  usePhoneHint((hint) => {
    if (!hint.replace(/\D/g, '').startsWith(country.dial)) return;
    setNumber(toLocalDigits(hint, country));
  }, number.length === 0);

  function onNumberChange(text: string) {
    // Normalised in JS rather than capped by `maxLength`, because the native
    // cap truncates a pasted "+91 98765 43210" before the dial code or a
    // trunk zero can be removed.
    setNumber(toLocalDigits(text, country));
  }

  function onCountryChange(next: Country) {
    setCountry(next);
    // A number typed for one country can be too long for the next.
    setNumber((current) => toLocalDigits(current, next));
  }

  async function onContinue() {
    if (submittingRef.current) return;

    setLocalError(null);
    clearError();

    const local = toLocalDigits(number, country);

    if (!local) {
      setLocalError('Enter your phone number.');
      return;
    }

    const parsed = phoneSchema.safeParse(`+${country.dial}${local}`);
    if (!parsed.success) {
      setLocalError(`Enter a valid phone number for ${country.name}.`);
      return;
    }

    // One flow at a time: `sendCode` owns the hook's busy state, but that
    // state lands a render late, so this local flag keeps Continue disabled
    // for the whole request and prevents overlapping OTP sends.
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      if (await sendCode(parsed.data)) {
        router.push({ pathname: '/verify', params: { phone: parsed.data } });
      }
    } catch (unexpected) {
      // Never leave the customer on this screen with no explanation: a failed
      // code request or navigation must surface as a visible, retryable error.
      if (__DEV__) {
        console.warn(
          '[phone] continue failed',
          unexpected instanceof Error ? unexpected.name : 'unknown',
        );
      }
      setLocalError('Could not continue. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const hasError = Boolean(localError ?? error);
  // The whole request owns the loading state.
  const busy = isBusy || isSubmitting;
  const continueLabel = 'Continue';

  return (
    /* The country sheet is a plain `BottomSheet` mounted beside the screen
       tree rather than inside it, because the scroll view would otherwise
       drag the sheet with its content. */
    <View className="flex-1">
      {/* No top safe-area edge: the hero's blue band runs edge-to-edge behind
          the status bar, like the welcome screen's background. */}
      <Screen
        edges={['bottom']}
        scrollable
        keyboardAware
        className="bg-surface"
        footer={
          /* CTA pinned below the scroll area: it rides above the keyboard
             while the number field is being edited. */
          <View className="gap-5 pb-4 pt-6">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={continueLabel}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => {
                void onContinue();
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
              }}
              className={cn(
                'min-h-[60px] w-full flex-row items-center justify-center rounded-lg bg-brand px-6 active:opacity-80',
                busy && 'opacity-40',
              )}
            >
              {busy ? (
                <ActivityIndicator size="small" color={color['brand-contrast']} />
              ) : (
                <Text
                  variant="bodyLg"
                  className="font-semibold"
                  style={{ color: color['brand-contrast'] }}
                >
                  {continueLabel}
                </Text>
              )}
            </Pressable>
            <View>
              <Text variant="footnote" className="text-center text-text-secondary">
                By continuing, you agree to our
              </Text>
              <View className="mt-2 flex-row flex-wrap justify-center gap-x-5 gap-y-2">
                <LegalLink label="Terms of Service" url={TERMS_URL} />
                <LegalLink label="Privacy Policy" url={PRIVACY_URL} />
              </View>
            </View>
          </View>
        }
      >
        <StatusBar style="light" />
        <AuthHero />
        <View className="flex-1 justify-center py-10">
          <Text variant="titleLg" className="text-center">
            Log in or sign up
          </Text>
          <Text variant="footnote" className="mt-2 text-center">
            We&apos;ll text you a {OTP_LENGTH}-digit code to verify it&apos;s you.
          </Text>

          {/* ── Phone row ─────────────────────────────────────────────────── */}
          <View className="mt-8 flex-row gap-3">
            {/* The flag + dial code box opens the country sheet; the number
              field next to it carries the error border. */}
            <CountryCodeButton
              country={country}
              expanded={pickerOpen}
              disabled={busy}
              onPress={() => setPickerOpen(true)}
            />

            <View
              className={cn(
                'h-14 flex-1 flex-row items-center rounded-lg border bg-surface pl-4 pr-3',
                hasError ? 'border-danger' : 'border-border',
              )}
            >
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
                autoFocus
                editable={!busy}
                style={{ includeFontPadding: false, paddingVertical: 0 }}
                className="h-full min-w-0 flex-1 bg-transparent text-body-lg leading-6 text-text-primary"
              />
            </View>
          </View>

          {hasError ? (
            <Text variant="footnote" className="mt-1.5 text-danger">
              {localError ?? error}
            </Text>
          ) : null}
        </View>
      </Screen>

      <CountryPickerSheet
        visible={pickerOpen}
        selectedIso={country.iso}
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          onCountryChange(next);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
