import { View } from 'react-native';
import { router } from 'expo-router';
import { isCustomerProfileComplete, nextIncompleteCustomerStep } from '@samona/types';
import { LoadingState } from '@/components/feedback';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Avatar, Badge, Card, Text } from '@/components/ui';
import { useCustomerProfile, useSession } from '@/hooks';

export default function OnboardingReview() {
  const { data: profile } = useCustomerProfile();
  const { refetch } = useSession();

  if (!profile) {
    return <LoadingState message="Loading your profile" />;
  }

  const complete = isCustomerProfileComplete(profile);

  async function onFinish() {
    if (!complete) {
      router.push(`/onboarding/${nextIncompleteCustomerStep(profile ?? null)}`);
      return;
    }
    await refetch();
    router.replace('/home');
  }

  return (
    <OnboardingStepLayout
      step="review"
      title={complete ? "You're all set" : 'Almost there'}
      subtitle={
        complete
          ? 'Here is your profile summary.'
          : 'A few details are still missing. Tap below to finish them.'
      }
      primaryLabel={complete ? 'Go to home' : 'Finish remaining steps'}
      onPrimary={() => void onFinish()}
    >
      <Card className="flex-row items-center">
        <Avatar
          name={profile.displayName ?? 'SAMONA Customer'}
          size="lg"
          uri={profile.avatarUrl}
        />
        <View className="ml-4 flex-1">
          <Text variant="title">{profile.displayName ?? 'Your name'}</Text>
          <Text variant="footnote" className="mt-0.5">
            {profile.locationLabel ?? 'No address set'}
          </Text>
          <Badge
            label={complete ? 'Ready' : 'Incomplete'}
            tone={complete ? 'success' : 'warning'}
            className="mt-2"
          />
        </View>
      </Card>

      <Text variant="caption" className="mt-4">
        Payment methods and preferences can be added later from your profile.
      </Text>
    </OnboardingStepLayout>
  );
}
