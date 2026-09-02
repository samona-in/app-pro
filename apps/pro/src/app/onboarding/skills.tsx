import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingSkills() {
  const catalogue = useCatalogue();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [selected, setSelected] = useSeededState<string[]>(profile?.skillIds, []);

  // Only specialties belonging to the services just chosen. The server enforces
  // the same rule, so a stale selection cannot be saved either.
  const grouped = useMemo(() => {
    if (!catalogue.data || !profile) return [];
    return catalogue.data.services
      .filter((service) => profile.serviceIds.includes(service.id))
      .map((service) => ({
        service,
        skills: catalogue.data.skills.filter((skill) => skill.serviceId === service.id),
      }));
  }, [catalogue.data, profile]);

  function toggle(id: string) {
    setSelected(
      selected.includes(id) ? selected.filter((item: string) => item !== id) : [...selected, id],
    );
  }

  async function onContinue() {
    await save.mutateAsync({ skillIds: selected });
    router.push('/onboarding/experience');
  }

  if (catalogue.isPending) return <LoadingState message="Loading specialties" />;
  if (catalogue.isError) return <ErrorState onRetry={() => void catalogue.refetch()} />;

  return (
    <OnboardingStepLayout
      step="skills"
      title="What are your specialties?"
      subtitle="Being specific helps us send you the right jobs."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={selected.length === 0}
      error={save.isError ? 'Could not save your specialties. Please try again.' : null}
      footer={
        <Text variant="caption" className="text-center text-white/50">
          {selected.length} selected
        </Text>
      }
    >
      {grouped.length === 0 ? (
        <EmptyState
          dark
          title="Choose a service first"
          message="Go back a step and pick the services you provide."
          actionLabel="Back to services"
          onAction={() => router.back()}
        />
      ) : (
        <View className="gap-6">
          {grouped.map(({ service, skills }) => (
            <View key={service.id} className="gap-3">
              <Text variant="label" className="text-white/70">
                {service.name}
              </Text>
              {skills.map((skill) => (
                <SelectableCard
                  key={skill.id}
                  label={skill.name}
                  selected={selected.includes(skill.id)}
                  onToggle={() => toggle(skill.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </OnboardingStepLayout>
  );
}
