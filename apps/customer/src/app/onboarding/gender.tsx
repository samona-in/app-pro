import { View } from 'react-native';
import { router } from 'expo-router';
import { GENDER_OPTIONS, type Gender } from '@samona/types';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useCustomerProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingGender() {
  const { data: profile } = useCustomerProfile();
  const save = useSaveOnboardingStep();
  const [gender, setGender] = useSeededState<Gender | null>(profile?.gender, null);

  async function onContinue() {
    if (!gender) return;
    try {
      await save.mutateAsync({ gender });
    } catch {
      // The layout surfaces `save.isError`; a failed save must not advance.
      return;
    }
    router.push('/onboarding/address');
  }

  return (
    <OnboardingStepLayout
      step="gender"
      title="What's your gender?"
      subtitle="Helps us personalise your SAMONA experience."
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
