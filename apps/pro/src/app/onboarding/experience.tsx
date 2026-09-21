import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from '@samona/types';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingExperience() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [level, setLevel] = useSeededState<ExperienceLevel | null>(profile?.experienceLevel, null);

  async function onContinue() {
    if (!level) return;
    await save.mutateAsync({ experienceLevel: level });
    router.push('/onboarding/location');
  }

  return (
    <OnboardingStepLayout
      step="experience"
      title={t('onboarding.experience.title')}
      subtitle={t('onboarding.experience.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={level === null}
      error={save.isError ? t('onboarding.experience.saveError') : null}
    >
      <View className="gap-3">
        {EXPERIENCE_LEVELS.map((option) => (
          <SelectableCard
            key={option.value}
            label={t(`onboarding.experience.options.${option.value}`)}
            single
            selected={level === option.value}
            onToggle={() => setLevel(option.value)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}