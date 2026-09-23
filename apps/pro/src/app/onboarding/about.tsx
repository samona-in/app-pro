import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Input, Text } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Marathi', 'Bengali'];

export default function OnboardingAbout() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [bio, setBio] = useSeededState<string>(profile?.bio, '');
  const [languages, setLanguages] = useSeededState<string[]>(profile?.languages, []);

  function toggleLanguage(language: string) {
    setLanguages(
      languages.includes(language)
        ? languages.filter((item: string) => item !== language)
        : [...languages, language],
    );
  }

  async function onContinue() {
    // Both fields are optional: this step should never block a Pro who is
    // otherwise ready to work.
    await save.mutateAsync({ bio: bio.trim(), languages });
    router.push('/onboarding/review');
  }

  return (
    <OnboardingStepLayout
      step="about"
      title={t('onboarding.about.title')}
      subtitle={t('onboarding.about.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? t('onboarding.about.saveError') : null}
    >
      <Input
        label={t('onboarding.about.aboutYou')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('onboarding.about.bioPlaceholder')}
        multiline
        numberOfLines={4}
        maxLength={600}
        editable={!save.isPending}
        className="min-h-[112px] py-3"
        hint={`${bio.length}/600`}
      />

      <Text variant="label" className="mt-8">
        {t('onboarding.about.languagesLabel')}
      </Text>
      <View className="mt-3 gap-3">
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