import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GENDER_OPTIONS, type Gender } from '@samona/types';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingGender() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [gender, setGender] = useSeededState<Gender | null>(profile?.gender, null);

  async function onContinue() {
    if (!gender) return;
    await save.mutateAsync({ gender });
    router.push('/onboarding/services');
  }

  return (
    <OnboardingStepLayout
      step="gender"
      title={t('onboarding.gender.title')}
      subtitle={t('onboarding.gender.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={gender === null}
      error={save.isError ? t('onboarding.gender.saveError') : null}
    >
      <View className="gap-3">
        {GENDER_OPTIONS.map((option) => (
          <SelectableCard
            key={option.value}
            label={t(`onboarding.gender.options.${option.value}`)}
            single
            selected={gender === option.value}
            onToggle={() => setGender(option.value)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}