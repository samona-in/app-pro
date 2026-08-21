import { View } from 'react-native';
import { router } from 'expo-router';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';

const VALUE_PROPS = [
  'Get job requests from customers near you',
  'Accept the work that fits your schedule',
  'Track your earnings as you complete jobs',
];

export default function Welcome() {
  /**
   * Both buttons lead to the same place: a professional entering their number
   * does not know whether they already have an account, and the phone flow
   * resolves that itself.
   */
  function continueToPhone() {
    router.push('/phone');
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
        <Button label="Get started" size="lg" onPress={continueToPhone} />
        <Button label="I already have an account" variant="ghost" onPress={continueToPhone} />
        <Text variant="caption" className="mt-2 text-center">
          We&apos;ll verify your phone number with a six-digit code.
        </Text>
      </View>
    </Screen>
  );
}
