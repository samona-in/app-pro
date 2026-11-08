import { useState } from 'react';
import { View, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GENDER_OPTIONS, type Gender } from '@samona/types';
import { displayNameSchema } from '@samona/validation';
import femaleImage from '@/assets/images/gender/female.png';
import maleImage from '@/assets/images/gender/male.png';
import otherImage from '@/assets/images/gender/other.png';
import { OnboardingStepLayout, SelectableTile } from '@/components/onboarding';
import { Input, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

/** The illustration each gender tile shows, above its translated label. */
const GENDER_IMAGES = {
  MALE: maleImage,
  FEMALE: femaleImage,
  OTHER: otherImage,
} as const satisfies Record<Gender, ImageSourcePropType>;

/**
 * The first onboarding question: name and gender together.
 *
 * They were separate steps, but both are basic identity details shown to the
 * customer, and asking for them on one screen saves a tap without losing
 * anything — each answer is still saved in the same request.
 */
export default function OnboardingName() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [name, setName] = useSeededState<string>(profile?.displayName, '');
  const [gender, setGender] = useSeededState<Gender | null>(profile?.gender, null);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('validation.nameRequired'));
      return;
    }
    if (!gender) return;

    setError(null);
    // Saved now, not at the end, so closing the app here loses nothing.
    try {
      await save.mutateAsync({ displayName: parsed.data, gender });
    } catch {
      // `save.isError` surfaces the failure; a failed save must not advance.
      return;
    }
    router.push('/onboarding/services');
  }

  return (
    <OnboardingStepLayout
      title={t('onboarding.name.title')}
      subtitle={t('onboarding.name.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={name.trim().length < 2 || gender === null}
      error={save.isError ? t('onboarding.name.saveError') : null}
    >
      <Input
        label={t('onboarding.name.label')}
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.name.placeholder')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        autoFocus
        editable={!save.isPending}
        error={error ?? undefined}
        returnKeyType="next"
        onSubmitEditing={() => void onContinue()}
      />

      <View className="mt-6">
        <Text variant="label">{t('onboarding.name.genderLabel')}</Text>
        <View className="mt-2 flex-row gap-2" accessibilityRole="radiogroup">
          {GENDER_OPTIONS.map((option) => (
            <SelectableTile
              key={option.value}
              label={t(`onboarding.gender.options.${option.value}`)}
              image={GENDER_IMAGES[option.value]}
              selected={gender === option.value}
              onToggle={() => setGender(option.value)}
            />
          ))}
        </View>
      </View>
    </OnboardingStepLayout>
  );
}
