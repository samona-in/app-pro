import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH } from '@samona/config';
import { phoneSchema } from '@samona/validation';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Input, Screen, Text } from '@/components/ui';
import { usePhoneAuth, usePhoneHint } from '@/hooks';
import { PRIVACY_URL, TERMS_URL } from '@/constants/support';
import { openExternalUrl } from '@/utils/open-url';

/**
 * Step 1 of phone authentication: collect the number.
 *
 * Client-side validation is a UX convenience only — Supabase validates the
 * number and owns delivery of the code (CLAUDE.md "Validation").
 */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const { sendCode, isBusy, error, clearError } = usePhoneAuth();
  const [phone, setPhone] = useState('+91');
  const [localError, setLocalError] = useState<string | null>(null);

  // Android only: offer the SIM numbers as one-tap suggestions until the Pro
  // starts typing their own.
  usePhoneHint(setPhone, phone.trim() === '+91');

  async function onContinue() {
    setLocalError(null);
    clearError();

    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? t('validation.phoneInvalid'));
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
          {t('phone.heading')}
        </Text>
        <Text variant="body" className="mt-2 text-text-secondary">
          {t('phone.helper', { otpLength: OTP_LENGTH })}
        </Text>

        <Input
          label={t('phone.label')}
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          autoFocus
          editable={!isBusy}
          error={localError ?? error ?? undefined}
          hint={t('phone.hint')}
          containerClassName="mt-8"
        />
      </View>

      <View className="gap-3 pb-4">
        <Button
          label={t('phone.sendCode')}
          size="lg"
          loading={isBusy}
          onPress={() => void onContinue()}
        />
        <Text variant="caption" className="text-center">
          {t('phone.legal')}
        </Text>
        <View className="flex-row justify-center gap-5">
          <Text
            variant="caption"
            className="text-brand"
            onPress={() =>
              openExternalUrl(
                TERMS_URL,
                t('helpSupport.errors.pageFailedTitle'),
                t('helpSupport.errors.pageFailedMessage'),
              )
            }
          >
            {t('helpSupport.rows.terms')}
          </Text>
          <Text
            variant="caption"
            className="text-brand"
            onPress={() =>
              openExternalUrl(
                PRIVACY_URL,
                t('helpSupport.errors.pageFailedTitle'),
                t('helpSupport.errors.pageFailedMessage'),
              )
            }
          >
            {t('helpSupport.rows.privacy')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
