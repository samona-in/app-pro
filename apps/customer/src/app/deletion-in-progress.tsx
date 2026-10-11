import { router } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/hooks';
import { Button, Screen, Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * Shown when the server refuses to hand out a session because an accepted
 * account deletion is still in progress (the account has active bookings it is
 * waiting on). New bookings are blocked until the deletion finalizes, so there
 * is nothing to do here but wait or sign out.
 */
export default function DeletionInProgressScreen() {
  const { signOut } = useSession();

  async function onReturnToSignIn() {
    await signOut();
    router.replace('/');
  }

  return (
    <Screen edges={['bottom']}>
      <View className="flex-1 items-center justify-center px-6 py-10">
        <Ionicons name="hourglass-outline" size={48} color={color.brand} />
        <Text variant="titleLg" className="mt-4 text-center">
          Deletion in progress
        </Text>
        <Text variant="body" className="mt-2 text-center text-text-secondary">
          Your account is being deleted. You can't place new bookings while this
          finishes. Please try again later.
        </Text>
      </View>
      <Button
        label="Return to sign in"
        variant="secondary"
        onPress={() => void onReturnToSignIn()}
        className="mb-4"
      />
    </Screen>
  );
}