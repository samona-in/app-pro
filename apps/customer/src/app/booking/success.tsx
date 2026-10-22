import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, Text } from '@/components/ui';
import { color } from '@/theme';

export default function BookingSuccess() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-success-surface">
          <Ionicons name="checkmark-circle" size={44} color={color.success} />
        </View>

        <Text variant="titleLg" className="mt-6 text-center">
          Request sent
        </Text>
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          We're sharing your request with nearby professionals who match your job. You'll be
          notified as soon as one accepts — track it anytime from the Bookings tab.
        </Text>
      </View>

      <View className="gap-3 pb-4 pt-6">
        <Button label="Done" size="lg" onPress={() => router.dismissAll()} />
      </View>
    </Screen>
  );
}
