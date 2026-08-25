import { View } from 'react-native';
import { router } from 'expo-router';
import { OTP_LENGTH } from '@samona/config';
import { Wordmark } from '@/components/brand/Wordmark';
import { Button, Screen, Text } from '@/components/ui';

const VALUE_PROPS = [
  'Find skilled professionals near you',
  'Book services that fit your schedule',
  'Track your bookings in real time',
];

export default function Welcome() {
  function continueToPhone() {
    router.push('/phone');
  }

  return (
    <Screen edges={['top', 'bottom']} className="bg-surface">
      <View className="flex-1 justify-center">
        <Wordmark size="lg" />

        <Text variant="titleLg" className="mt-8">
          Services, at your doorstep.
        </Text>
        <Text variant="bodyLg" className="mt-3 text-text-secondary">
          SAMONA connects you with skilled professionals in your neighbourhood.
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
          We&apos;ll verify your phone number with a {OTP_LENGTH}-digit code.
        </Text>
      </View>
    </Screen>
  );
}
