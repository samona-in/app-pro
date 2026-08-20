import { View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Wordmark } from '@/components/brand/Wordmark';
import { EmptyState } from '@/components/feedback';
import { Badge, Card, IconButton, Screen, Text } from '@/components/ui';
import { useAppStore } from '@/stores/app';
import { color } from '@/theme';

function AvailabilityCard() {
  const isOnline = useAppStore((state) => state.isOnline);
  const setOnline = useAppStore((state) => state.setOnline);

  /**
   * Local-only toggle for now. The real implementation posts availability to
   * the server and reflects the confirmed value from TanStack Query — the
   * server owns whether a professional is online.
   */
  function toggle() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setOnline(!isOnline);
  }

  return (
    <Card variant="raised" className={isOnline ? 'bg-surface-inverse' : 'bg-surface'}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text variant="label" className={isOnline ? 'text-text-muted' : 'text-text-secondary'}>
            Availability
          </Text>
          <Text
            variant="titleLg"
            className={isOnline ? 'mt-1 text-text-inverse' : 'mt-1 text-text-primary'}
          >
            {isOnline ? "You're online" : "You're offline"}
          </Text>
          <Text variant="footnote" className="mt-1">
            {isOnline
              ? 'Receiving job requests near you.'
              : 'Go online to start receiving job requests.'}
          </Text>
        </View>

        <IconButton
          name={isOnline ? 'power' : 'power-outline'}
          accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
          onPress={toggle}
          haptic={false}
          tint={isOnline ? color['text-inverse'] : color['text-primary']}
          className={isOnline ? 'h-14 w-14 bg-online' : 'h-14 w-14 bg-surface-muted'}
          size={26}
        />
      </View>
    </Card>
  );
}

function TodaySnapshot() {
  return (
    <View className="mt-4 flex-row gap-3">
      <Card className="flex-1">
        <Text variant="label">Jobs today</Text>
        <Text variant="display" className="mt-1">
          0
        </Text>
      </Card>
      <Card className="flex-1">
        <Text variant="label">Earned today</Text>
        <Text variant="display" className="mt-1">
          ₹0
        </Text>
      </Card>
    </View>
  );
}

export default function Home() {
  const isOnline = useAppStore((state) => state.isOnline);

  return (
    <Screen scrollable>
      <View className="flex-row items-center justify-between pt-2">
        <Wordmark size="sm" />
        <IconButton
          name="notifications-outline"
          accessibilityLabel="Notifications"
          onPress={() => router.push('/notifications')}
        />
      </View>

      <View className="mt-6">
        <AvailabilityCard />
        <TodaySnapshot />
      </View>

      <View className="mt-8 flex-row items-center justify-between">
        <Text variant="title">Job requests</Text>
        <Badge
          label={isOnline ? 'Listening' : 'Paused'}
          tone={isOnline ? 'success' : 'neutral'}
          withDot
        />
      </View>

      <Card className="mt-3 min-h-[220px] justify-center">
        <EmptyState
          icon={isOnline ? 'radio-outline' : 'moon-outline'}
          title={isOnline ? 'Waiting for requests' : 'You are offline'}
          message={
            isOnline
              ? 'New jobs near you will appear here the moment they come in.'
              : 'Go online to start receiving job requests from customers nearby.'
          }
        />
      </Card>
    </Screen>
  );
}
