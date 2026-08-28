import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SkillOption } from '@samona/types';
import { BookingStep } from '@/components/booking';
import { ErrorState, LoadingState } from '@/components/feedback';
import { SelectableCard } from '@/components/onboarding';
import { useServiceSkills } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

export default function BookingSkill() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const skills = useServiceSkills(slug);
  const draft = useBookingDraft();
  const [skillId, setSkillId] = useState<string | null>(draft.skill?.id ?? null);

  const selected = skills.data?.find((item) => item.id === skillId) ?? null;

  function onContinue() {
    if (!selected) return;
    draft.setSkill(selected);
    router.push(`/booking/new/${slug}/details`);
  }

  if (skills.isPending) {
    return (
      <View className="flex-1 justify-center">
        <LoadingState message="Loading job categories" size="inline" />
      </View>
    );
  }

  if (skills.isError || !skills.data) {
    return (
      <View className="flex-1 justify-center">
        <ErrorState
          title="Couldn't load job categories"
          message="Check your connection and try again."
          onRetry={() => void skills.refetch()}
        />
      </View>
    );
  }

  return (
    <BookingStep
      step={2}
      title="What exactly do you need?"
      subtitle="Pick the job category that matches your request."
      primaryDisabled={selected === null}
      onPrimary={() => void onContinue()}
    >
      <View className="gap-3">
        {skills.data.map((skill: SkillOption) => (
          <SelectableCard
            key={skill.id}
            label={skill.name}
            single
            selected={skill.id === skillId}
            onToggle={() => setSkillId(skill.id)}
          />
        ))}
      </View>
    </BookingStep>
  );
}
