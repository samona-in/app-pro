import { useState } from 'react';
import { router } from 'expo-router';
import { displayNameSchema } from '@samona/validation';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Input } from '@/components/ui';
import { useProProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingName() {
  const { data: profile } = useProProfile();
  const save = useSaveOnboardingStep();
  const [name, setName] = useSeededState<string>(profile?.displayName, '');
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter your name.');
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
      title="What's your name?"
      subtitle="Customers see this when you accept their job."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={name.trim().length < 2}
      error={save.isError ? 'Could not save your name. Please try again.' : null}
    >
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Asha Kumar"
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
