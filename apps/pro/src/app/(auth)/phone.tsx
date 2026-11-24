
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';

import {
  AuthHero,
  CountryCodeButton,
  CountryPickerSheet,
} from '@/components/auth';
import { Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { DEFAULT_COUNTRY, type Country } from '@/constants/countries';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { openExternalUrl } from '@/utils/open-url';
import { toLocalDigits } from '@/utils/phone';

function LegalLink({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
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

export default function PhoneScreen() {
  const { t } = useTranslation();

  const {
    sendCode,
    isBusy,
    error,
    clearError,
  } = usePhoneAuth();

  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submittingRef = useRef(false);

  // Keeps the latest input available to async callbacks.
  const numberRef = useRef('');

  const busy = isBusy || isSubmitting;
  const hasError = Boolean(localError ?? error);
  const continueLabel = t('common.continue');

  function updateNumber(value: string) {
    numberRef.current = value;
    setNumber(value);
  }

  // Android SIM phone number suggestion.
  usePhoneHint(
    (hint) => {
      // Never overwrite manually entered input.
      if (numberRef.current.length > 0) return;

      // Only accept suggestions matching the selected country.
      if (!hint.replace(/\D/g, '').startsWith(country.dial)) {
        return;
      }

      updateNumber(toLocalDigits(hint, country));
    },
    number.length === 0,
  );

  function onNumberChange(value: string) {
    updateNumber(toLocalDigits(value, country));

    if (localError) {
      setLocalError(null);
    }

    if (error) {
      clearError();
    }
  }

  function onCountryChange(next: Country) {
    setCountry(next);

    const updated = toLocalDigits(numberRef.current, next);
    updateNumber(updated);
  }

  async function onContinue() {
    if (submittingRef.current) return;

    setLocalError(null);
    clearError();

    const local = toLocalDigits(numberRef.current, country);


    if (!local) {
      setLocalError(t('phone.enterNumber'));
      return;
    }

    const parsed = phoneSchema.safeParse(
      `+${country.dial}${local}`,
    );

    console.log('[phone] local=', local, 'parsed=', parsed.success, 'error=', localError ?? error);

    if (!parsed.success) {
      setLocalError(
        t('phone.invalidForCountry', {
          country: country.name,
        }),
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const success = await sendCode(parsed.data);

      if (success) {
        router.push({
          pathname: '/verify',
          params: {
            phone: parsed.data,
          },
        });
      }
    } catch (unexpected) {
      if (__DEV__) {
        console.error(
          '[phone] continue failed:',
          unexpected,
        );
      }

      setLocalError(t('phone.couldNotSend'));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1">
      <Screen
        edges={['bottom']}
        scrollable
        keyboardAware
        className="bg-surface"
        footer={
          <View className="gap-5 pb-4 pt-6">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={continueLabel}
              accessibilityState={{
                disabled: busy,
                busy,
              }}
              disabled={busy}
              onPress={() => {
                console.log('[phone] press');
                void onContinue();
                void Haptics.impactAsync(
                  Haptics.ImpactFeedbackStyle.Medium,
                ).catch(() => {});
              }}
              className={cn(
                'min-h-[60px] w-full flex-row items-center justify-center rounded-lg bg-brand px-6 active:opacity-80',
                busy && 'opacity-40',
              )}
            >
              {busy ? (
                <ActivityIndicator
                  size="small"
                  color={color['brand-contrast']}
                />
              ) : (
                <Text
                  variant="bodyLg"
                  className="font-semibold"
                  style={{
                    color: color['brand-contrast'],
                  }}
                >
                  {continueLabel}
                </Text>
              )}
            </Pressable>

            <View>
              <Text
                variant="footnote"
                className="text-center text-text-secondary"
              >
                {t('phone.legalPrefix')}
              </Text>

              <View className="mt-2 flex-row flex-wrap justify-center gap-x-5 gap-y-2">
                <LegalLink
                  label={t('helpSupport.rows.terms')}
                  url={TERMS_URL}
                />

                <LegalLink
                  label={t('helpSupport.rows.privacy')}
                  url={PRIVACY_URL}
                />
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
            {t('phone.helper', {
              otpLength: OTP_LENGTH,
            })}
          </Text>

          <View className="mt-8 flex-row gap-3">
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
                style={{
                  includeFontPadding: false,
                  paddingVertical: 0,
                }}
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
