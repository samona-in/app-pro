import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { OnboardingStepLayout, SelectableCard } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingServices() {
  const { t } = useTranslation();
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
    return <LoadingState message={t('onboarding.services.loading')} />;
  }
  if (catalogue.isError) {
    return <ErrorState onRetry={() => void catalogue.refetch()} />;
  }

  return (
    <OnboardingStepLayout
      step="services"
      title={t('onboarding.services.title')}
      subtitle={t('onboarding.services.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={selected.length === 0}
      error={save.isError ? t('onboarding.services.saveError') : null}
      footer={
        <Text variant="caption" className="text-center text-text-muted">
          {t('onboarding.services.nSelected', { count: selected.length })}
        </Text>
      }
    >
      {catalogue.data.services.length === 0 ? (
        <EmptyState title={t('onboarding.services.emptyTitle')} message={t('onboarding.services.emptyMessage')} />
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