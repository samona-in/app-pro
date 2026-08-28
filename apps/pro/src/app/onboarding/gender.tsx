import { View } from 'react-native';
import { router } from 'expo-router';
import { GENDER_OPTIONS, type Gender } from '@samona/types';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingGender() {
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
      title="What's your gender?"
      subtitle="Helps us personalise your SAMONA Pro experience."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={gender === null}
      error={save.isError ? 'Could not save your gender. Please try again.' : null}
    >
      <View className="gap-3">
        {GENDER_OPTIONS.map((option) => (
          <SelectableCard
            key={option.value}
            label={option.label}
            single
            selected={gender === option.value}
            onToggle={() => setGender(option.value)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}
