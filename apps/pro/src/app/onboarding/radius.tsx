import { router } from 'expo-router';
import { View } from 'react-native';
import { LOCATION_DEFAULTS } from '@samona/config';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

const RADIUS_OPTIONS = [5, 10, 15, 20];

export default function OnboardingRadius() {
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();

  const [radius, setRadius] = useSeededState<number>(
    profile?.serviceRadiusKm,
    LOCATION_DEFAULTS.serviceRadiusKm,
  );

  async function onContinue() {
    await save.mutateAsync({ serviceRadiusKm: radius });
    router.push('/onboarding/about');
  }

  return (
    <OnboardingStepLayout
      step="radius"
      title="How far will you travel?"
      subtitle="Customers outside this distance won't see your profile."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      error={save.isError ? 'Could not save your service area. Please try again.' : null}
    >
      <View className="gap-3">
        {RADIUS_OPTIONS.map((option) => (
          <SelectableCard
            key={option}
            label={`${option} km`}
            single
            selected={radius === option}
            onToggle={() => setRadius(option)}
          />
        ))}
      </View>
    </OnboardingStepLayout>
  );
}
