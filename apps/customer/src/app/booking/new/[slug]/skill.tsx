import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import type { SkillOption } from '@samona/types';
import { JOB_CUSTOM_SKILL_MAX, JOB_CUSTOM_SKILL_MIN, OTHER_SKILL_SLUG } from '@samona/types';
import { BookingStep } from '@/components/booking';
import { ErrorState, LoadingState } from '@/components/feedback';
import { SelectableCard } from '@/components/onboarding';
import { Input } from '@/components/ui';
import { useServiceSkills } from '@/hooks';
import { useBookingDraft } from '@/stores/booking';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function BookingSkill() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const skills = useServiceSkills(slug);
  const draft = useBookingDraft();
  const [skillId, setSkillId] = useState<string | null>(draft.skill?.id ?? null);
  const [customText, setCustomText] = useState(draft.customSkill);

  const other = skills.data?.find((item) => item.slug === OTHER_SKILL_SLUG) ?? null;
  const predefined = (skills.data ?? []).filter((item) => item.slug !== OTHER_SKILL_SLUG);
  const isOther = skillId === other?.id;
  const customLength = customText.trim().length;
  const canContinue = isOther
    ? customLength >= JOB_CUSTOM_SKILL_MIN && customLength <= JOB_CUSTOM_SKILL_MAX
    : skillId !== null;

  function onContinue() {
    if (!canContinue) return;
    if (isOther && other) {
      draft.setSkill(other, customText.trim());
    } else {
      const selected = predefined.find((skill) => skill.id === skillId) ?? null;
      if (!selected) return;
      draft.setSkill(selected);
    }
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
      primaryDisabled={!canContinue}
      onPrimary={() => void onContinue()}
    >
      <View className="gap-3">
        {predefined.map((skill: SkillOption) => (
          <SelectableCard
            key={skill.id}
            label={skill.name}
            single
            selected={skill.id === skillId}
            onToggle={() => {
              setSkillId(skill.id);
              if (skillId !== skill.id) setCustomText('');
            }}
          />
        ))}

        {other ? (
          <SelectableCard
            label="Other"
            icon={'ellipsis-horizontal-circle-outline' as IoniconName}
            single
            selected={isOther}
            onToggle={() => {
              setSkillId(other.id);
              if (!isOther) setCustomText('');
            }}
          />
        ) : null}

        {isOther ? (
          <View className="mt-2">
            <Input
              label="What kind of job is it?"
              placeholder="e.g. Inverter battery bank, garden setup"
              value={customText}
              onChangeText={setCustomText}
              autoCapitalize="sentences"
              maxLength={JOB_CUSTOM_SKILL_MAX}
            />
          </View>
        ) : null}
      </View>
    </BookingStep>
  );
}
