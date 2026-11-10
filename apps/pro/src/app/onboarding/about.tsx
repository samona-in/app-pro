import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi', 'Bengali'];

export default function OnboardingAbout() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [languages, setLanguages] = useSeededState<string[]>(profile?.languages, []);

  function toggleLanguage(language: string) {
    setLanguages(
      languages.includes(language)
        ? languages.filter((item: string) => item !== language)
        : [...languages, language],
    );
  }

  async function onContinue() {
    // At least one language is required, so the button stays disabled until
    // the Pro picks one (mirrors the services step's guard).
    await save.mutateAsync({ languages });
    // Documents and the face check follow this step, then review.
    router.push('/onboarding/documents');
  }

  return (
    <OnboardingStepLayout
      title={t('onboarding.about.title')}
      subtitle={t('onboarding.about.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={languages.length === 0}
      error={save.isError ? t('onboarding.about.saveError') : null}
    >
      <View className="gap-3">
        {LANGUAGES.map((language) => (
          <SelectableCard
            key={language}
            label={language}
            selected={languages.includes(language)}
            onToggle={() => toggleLanguage(language)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}
