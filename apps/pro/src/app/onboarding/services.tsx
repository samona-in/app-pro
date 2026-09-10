import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingServices() {
  const catalogue = useCatalogue();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  // Seeded from the saved profile, so returning here shows what was already
  // chosen rather than an empty form.
  const [selected, setSelected] = useSeededState<string[]>(profile?.serviceIds, []);

  function toggle(id: string) {
    setSelected(
      selected.includes(id) ? selected.filter((item: string) => item !== id) : [...selected, id],
    );
  }

  async function onContinue() {
    await save.mutateAsync({ serviceIds: selected });
    router.push('/onboarding/skills');
  }

  if (catalogue.isPending) {
    return <LoadingState message="Loading services" />;
  }
  if (catalogue.isError) {
    return <ErrorState onRetry={() => void catalogue.refetch()} />;
  }

  return (
    <OnboardingStepLayout
      step="services"
      title="What services do you provide?"
      subtitle="Pick everything you do. You can change this later."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={selected.length === 0}
      error={save.isError ? 'Could not save your services. Please try again.' : null}
      footer={
        <Text variant="caption" className="text-center text-text-muted">
          {selected.length} selected
        </Text>
      }
    >
      {catalogue.data.services.length === 0 ? (
        <EmptyState title="No services available" message="Please try again shortly." />
      ) : (
        <View className="gap-3">
          {catalogue.data.services.map((service) => (
            <SelectableCard
              key={service.id}
              label={service.name}
              imageUri={service.icon}
              selected={selected.includes(service.id)}
              onToggle={() => toggle(service.id)}
            />
          ))}
        </View>
      )}
    </OnboardingStepLayout>
  );
}
