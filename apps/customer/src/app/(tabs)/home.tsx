import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '@/components/brand/Wordmark';
import { EmptyState } from '@/components/feedback';
import { Card, IconButton, Screen, Text } from '@/components/ui';
import { color } from '@/theme';

const QUICK_ACTIONS = [
  { icon: 'search-outline' as const, label: 'Find services', route: '/bookings' },
  { icon: 'location-outline' as const, label: 'Nearby pros', route: '/bookings' },
  { icon: 'receipt-outline' as const, label: 'Past bookings', route: '/bookings' },
];

export default function Home() {
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
        <Card variant="raised" className="bg-surface">
          <Text variant="label" className="text-text-secondary">
            Welcome back
          </Text>
          <Text variant="titleLg" className="mt-1">
            What do you need today?
          </Text>
          <Text variant="footnote" className="mt-1">
            Find skilled professionals for any task.
          </Text>
        </Card>
      </View>

      <Text variant="title" className="mt-8">
        Quick actions
      </Text>

      <View className="mt-3 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <Card key={action.label}>
            <View className="flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
                <Ionicons name={action.icon} size={20} color={color['text-secondary']} />
              </View>
              <Text variant="bodyStrong" className="flex-1">
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={color['text-muted']} />
            </View>
          </Card>
        ))}
      </View>

      <Text variant="title" className="mt-8">
        Recent bookings
      </Text>

      <Card className="mt-3 min-h-[160px] justify-center">
        <EmptyState
          icon="calendar-outline"
          title="No bookings yet"
          message="Your bookings will appear here once you make your first request."
        />
      </Card>
    </Screen>
  );
}
