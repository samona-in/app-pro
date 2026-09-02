import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { color } from '@/theme';

const PROMISES = [
  { icon: 'briefcase-outline', text: 'Choose the work you want' },
  { icon: 'map-outline', text: 'Set where and how far you travel' },
  { icon: 'wallet-outline', text: 'Get paid for every completed job' },
] as const;

export default function OnboardingIntro() {
  return (
    <OnboardingStepLayout
      step="intro"
      title="Welcome to SAMONA Pro"
      subtitle="Turn your skills into more jobs."
      primaryLabel="Get started"
      onPrimary={() => router.push('/onboarding/name')}
    >
      <View className="gap-6 pt-2">
        {PROMISES.map((item) => (
          <View key={item.text} className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-onboarding-surface">
              <Ionicons name={item.icon} size={20} color={color.brand} />
            </View>
            <Text variant="body" className="ml-4 flex-1 text-white/80">
              {item.text}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" className="mt-10 text-white/40">
        Takes about two minutes. You can stop and pick up where you left off.
      </Text>
    </OnboardingStepLayout>
  );
}
