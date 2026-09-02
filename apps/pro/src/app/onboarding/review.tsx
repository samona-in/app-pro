import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  EXPERIENCE_LEVELS,
  GENDER_OPTIONS,
  isProProfileComplete,
  nextIncompleteStep,
} from '@samona/types';
import { LoadingState } from '@/components/feedback';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Avatar, Badge, Card, Divider, Text } from '@/components/ui';
import { useCatalogue, useProProfile, useSession } from '@/hooks';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between px-4 py-3">
      <Text variant="body" className="mr-4 text-white/60">
        {label}
      </Text>
      <Text variant="bodyStrong" className="flex-1 text-right text-white">
        {value}
      </Text>
    </View>
  );
}

export default function OnboardingReview() {
  const { data: profile } = useProProfile();
  const catalogue = useCatalogue();
  const { refetch } = useSession();

  const summary = useMemo(() => {
    if (!profile || !catalogue.data) return null;

    const names = (ids: string[], from: { id: string; name: string }[]) =>
      from.filter((item) => ids.includes(item.id)).map((item) => item.name);

    return {
      gender: GENDER_OPTIONS.find((option) => option.value === profile.gender)?.label ?? '—',
      services: names(profile.serviceIds, catalogue.data.services),
      skills: names(profile.skillIds, catalogue.data.skills),
      experience:
        EXPERIENCE_LEVELS.find((level) => level.value === profile.experienceLevel)?.label ?? '—',
    };
  }, [profile, catalogue.data]);

  if (!profile || !summary) {
    return <LoadingState message="Loading your profile" />;
  }

  const complete = isProProfileComplete(profile);

  /**
   * The server already recomputed status on the last save, so finishing is a
   * refetch and a redirect rather than another write. If something is still
   * missing, send the Pro to that step instead of into a broken home screen.
   */
  async function onFinish() {
    if (!complete) {
      router.push(`/onboarding/${nextIncompleteStep(profile ?? null)}`);
      return;
    }
    await refetch();
    router.replace('/home');
  }

  return (
    <OnboardingStepLayout
      step="review"
      title={complete ? "You're ready to receive jobs" : 'Almost there'}
      subtitle={
        complete
          ? 'Here is what customers will see.'
          : 'A few details are still missing. Tap below to finish them.'
      }
      primaryLabel={complete ? 'Go to dashboard' : 'Finish remaining steps'}
      onPrimary={() => void onFinish()}
    >
      <Card dark className="flex-row items-center">
        <Avatar name={profile.displayName ?? 'SAMONA Pro'} size="lg" uri={profile.selfiePhotoUrl} />
        <View className="ml-4 flex-1">
          <Text variant="title" className="text-white">
            {profile.displayName ?? 'Your name'}
          </Text>
          <Text variant="footnote" className="mt-0.5 text-white/60">
            {summary.experience}
          </Text>
          <Badge
            label={complete ? 'Ready' : 'Incomplete'}
            tone={complete ? 'success' : 'warning'}
            className="mt-2"
          />
        </View>
      </Card>

      <Card dark className="mt-4" padded={false}>
        <SummaryRow label="Gender" value={summary.gender} />
        <Divider dark />
        <SummaryRow label="Services" value={summary.services.join(', ') || '—'} />
        <Divider dark />
        <SummaryRow label="Specialties" value={summary.skills.join(', ') || '—'} />
        <Divider dark />
        <SummaryRow label="Travels up to" value={`${profile.serviceRadiusKm} km`} />
        <Divider dark />
        <SummaryRow label="Languages" value={profile.languages.join(', ') || '—'} />
      </Card>

      {profile.bio ? (
        <Card dark className="mt-4">
          <Text variant="label" className="text-white/70">
            About you
          </Text>
          <Text variant="body" className="mt-2 text-white/70">
            {profile.bio}
          </Text>
        </Card>
      ) : null}

      <Text variant="caption" className="mt-4 text-white/40">
        Documents, payout details and certifications can be added later from your profile.
      </Text>
    </OnboardingStepLayout>
  );
}
