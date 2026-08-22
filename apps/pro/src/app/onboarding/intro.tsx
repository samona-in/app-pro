import { View } from 'react-native';
import { router } from 'expo-router';
import { Wordmark } from '@/components/brand/Wordmark';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Text } from '@/components/ui';

const PROMISES = [
  'Choose the work you want',
  'Set where and how far you travel',
  'Get paid for every completed job',
];

export default function OnboardingIntro() {
  return (
    <OnboardingStepLayout
      step="intro"
      title="Welcome to SAMONA Pro"
      subtitle="Turn your skills into more jobs."
      primaryLabel="Get started"
      onPrimary={() => router.push('/onboarding/name')}
    >
      <Wordmark size="sm" />

      <View className="mt-8 gap-4">
        {PROMISES.map((item) => (
          <View key={item} className="flex-row items-start">
            <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-brand" />
            <Text variant="body" className="flex-1 text-text-secondary">
              {item}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" className="mt-8">
        Takes about two minutes. You can stop and pick up where you left off.
      </Text>
    </OnboardingStepLayout>
  );
}
