import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { displayNameSchema } from '@samona/validation';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Input } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingName() {
  const { t } = useTranslation();
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [name, setName] = useSeededState<string>(profile?.displayName, '');
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('validation.nameRequired'));
      return;
    }

    setError(null);
    // Saved now, not at the end, so closing the app here loses nothing.
    await save.mutateAsync({ displayName: parsed.data });
    router.push('/onboarding/gender');
  }

  return (
    <OnboardingStepLayout
      step="name"
      title={t('onboarding.name.title')}
      subtitle={t('onboarding.name.subtitle')}
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={name.trim().length < 2}
      error={save.isError ? t('onboarding.name.saveError') : null}
    >
      <Input
        label={t('onboarding.name.label')}
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.name.placeholder')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        autoFocus
        editable={!save.isPending}
        error={error ?? undefined}
        returnKeyType="next"
        onSubmitEditing={() => void onContinue()}
      />
    </OnboardingStepLayout>
  );
}