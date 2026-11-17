import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { AuthHero, CountryCodeButton, CountryPickerSheet } from '@/components/auth';
import { Button, Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint, startOtpListening } from '@/hooks';
import { DEFAULT_COUNTRY, type Country } from '@/constants/countries';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { openExternalUrl } from '@/utils/open-url';
import { toLocalDigits } from '@/utils/phone';

/** A quiet legal link: dark label, dotted rule underneath, like the reference. */
function LegalLink({ label, url }: { label: string; url: string }) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() =>
        openExternalUrl(
          url,
          t('helpSupport.errors.pageFailedTitle'),
          t('helpSupport.errors.pageFailedMessage'),
        )
      }
      className="border-b border-dotted border-text-muted pb-0.5 active:opacity-60"
    >
      <Text variant="footnote" className="font-medium text-text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Step 1 of phone authentication: collect the number.
 *
 * Client-side validation is a UX convenience only — Supabase validates the
 * number and owns delivery of the code (CLAUDE.md "Validation").
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const { sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Covers the SMS-retriever arm before `sendCode` starts its own busy state. */
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
      setLocalError(t('phone.enterNumber'));
      return;
    }

    const parsed = phoneSchema.safeParse(`+${country.dial}${local}`);
    if (!parsed.success) {
      setLocalError(t('phone.invalidForCountry', { country: country.name }));
      return;
    }

    // One flow at a time: the retriever arm happens before `sendCode` sets the
    // hook's busy flag, so this local flag is what keeps Continue disabled for
    // the whole request and prevents overlapping OTP sends.
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Arm the SMS retriever before the code is requested, so Play Services
      // is already listening when the SMS lands — no gap for it to fall into.
      // Autofill is a convenience: a failed arm must not block the code request.
      try {
        await startOtpListening();
      } catch {
        // Manual entry still works when the native retriever is unavailable.
      }

      if (await sendCode(parsed.data)) {
        router.push({ pathname: '/verify', params: { phone: parsed.data } });
      }
    } catch (unexpected) {
      // Never leave the professional on this screen with no explanation: a
      // failed retriever arm or navigation must surface as a visible error.
      if (__DEV__) {
        console.warn(
          '[phone] continue failed',
          unexpected instanceof Error ? unexpected.name : 'unknown',
        );
      }
      setLocalError(t('phone.couldNotSend'));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const hasError = Boolean(localError ?? error);
  // The whole request, including the retriever arm, owns the loading state.
  const busy = isBusy || isSubmitting;

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
            <Button
              label={t('common.continue')}
              size="lg"
              loading={busy}
              onPress={() => void onContinue()}
            />
            <View>
              <Text variant="footnote" className="text-center text-text-secondary">
                {t('phone.legalPrefix')}
              </Text>
              <View className="mt-2 flex-row flex-wrap justify-center gap-x-5 gap-y-2">
                <LegalLink label={t('helpSupport.rows.terms')} url={TERMS_URL} />
                <LegalLink label={t('helpSupport.rows.privacy')} url={PRIVACY_URL} />
              </View>
            </View>
          </View>
        }
      >
        <StatusBar style="light" />
        <AuthHero />
        <View className="flex-1 justify-center py-10">
          <Text variant="titleLg" className="text-center">
            {t('phone.heading')}
          </Text>
          <Text variant="footnote" className="mt-2 text-center">
            {t('phone.helper', { otpLength: OTP_LENGTH })}
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
                placeholder={t('phone.numberPlaceholder')}
                placeholderTextColor={color['text-muted']}
                accessibilityLabel={t('phone.label')}
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
