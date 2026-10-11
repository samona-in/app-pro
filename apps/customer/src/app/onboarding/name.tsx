import { useState } from 'react';
import { router } from 'expo-router';
import { displayNameSchema } from '@samona/validation';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Input } from '@/components/ui';
import { useCustomerProfile, useSaveOnboardingStep, useSeededState } from '@/hooks';

export default function OnboardingName() {
  const { data: profile } = useCustomerProfile();
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
    try {
      await save.mutateAsync({ displayName: parsed.data });
    } catch {
      // The layout surfaces `save.isError`; a failed save must not advance.
      return;
    }
    router.push('/onboarding/gender');
  }

  return (
    <OnboardingStepLayout
      step="name"
      title="What's your name?"
      subtitle="Professionals will see this when they accept your request."
      onPrimary={() => void onContinue()}
      isSaving={save.isPending}
      primaryDisabled={name.trim().length < 2}
      error={save.isError ? 'Could not save your name. Please try again.' : null}
    >
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Priya Sharma"
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
