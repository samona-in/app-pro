import { View } from 'react-native';
import { router } from 'expo-router';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';
import { useSessionStore } from '@/stores/session';

const VALUE_PROPS = [
  'Get job requests from customers near you',
  'Accept the work that fits your schedule',
  'Track your earnings as you complete jobs',
];

export default function Welcome() {
  const setSession = useSessionStore((state) => state.setSession);

  /**
   * Scaffold only. This stands in for the real sign-in flow so the navigation
   * structure is walkable end to end; it seeds a local placeholder session and
   * performs no authentication. Replace with the auth feature.
   */
  function continueToApp() {
    setSession({
      id: 'placeholder-pro',
      role: 'PRO',
      email: null,
      phone: null,
      fullName: 'SAMONA Pro',
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    });
    router.replace('/home');
  }

  return (
    <Screen edges={['top', 'bottom']} className="bg-surface">
      <View className="flex-1 justify-center">
        <Wordmark size="lg" />

        <Text variant="titleLg" className="mt-8">
          Work that comes to you.
        </Text>
        <Text variant="bodyLg" className="mt-3 text-text-secondary">
          SAMONA Pro connects you with customers nearby who need your skills.
        </Text>

        <View className="mt-10 gap-4">
          {VALUE_PROPS.map((item) => (
            <View key={item} className="flex-row items-start">
              <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-brand" />
              <Text variant="body" className="flex-1 text-text-secondary">
                {item}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3 pb-4">
        <Button label="Get started" size="lg" onPress={continueToApp} />
        <Button label="I already have an account" variant="ghost" onPress={continueToApp} />
        <Text variant="caption" className="mt-2 text-center">
          By continuing you agree to the SAMONA Pro terms and privacy policy.
        </Text>
      </View>
    </Screen>
  );
}
