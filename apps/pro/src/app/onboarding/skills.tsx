import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingSkills() {
  const { t } = useTranslation();
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

  if (catalogue.isPending) return <LoadingState message={t('onboarding.skills.loading')} />;
  if (catalogue.isError) return <ErrorState onRetry={() => void catalogue.refetch()} />;

  return (
    <OnboardingStepLayout
      step="skills"
      title={t('onboarding.skills.title')}
      subtitle={t('onboarding.skills.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={selected.length === 0}
      error={save.isError ? t('onboarding.skills.saveError') : null}
      footer={
        <Text variant="caption" className="text-center text-text-muted">
          {t('onboarding.skills.nSelected', { count: selected.length })}
        </Text>
      }
    >
      {grouped.length === 0 ? (
        <EmptyState
          title={t('onboarding.skills.chooseServiceTitle')}
          message={t('onboarding.skills.chooseServiceMessage')}
          actionLabel={t('onboarding.skills.backToServices')}
          onAction={() => router.back()}
        />
      ) : (
        <View className="gap-6">
          {grouped.map(({ service, skills }) => (
            <View key={service.id} className="gap-3">
              <Text variant="label" className="text-text-secondary">
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