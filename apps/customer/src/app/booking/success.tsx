import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen, Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * How long the confirmation stays up before it hands off to the booking. Long
 * enough to read the message, short enough that it never feels like a detour.
 */
const AUTO_ADVANCE_MS = 2500;

export default function BookingSuccess() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigatingRef = useRef(false);

  const openBooking = useCallback(() => {
    // The timer and the button can both fire; only the first one wins.
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    // Drop the completed five-step flow so back from the booking lands on the
    // tabs, not on a step the customer already finished.
    router.dismissAll();
    if (id) {
      router.push({ pathname: '/booking/[id]', params: { id } });
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(openBooking, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [openBooking]);

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
        <Button label="View booking" size="lg" onPress={openBooking} />
        <Text variant="footnote" className="text-center text-text-muted">
          Opening your booking…
        </Text>
      </View>
    </Screen>
  );
}
