import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Wordmark } from '@/components/brand/Wordmark';
import { EmptyState } from '@/components/feedback';
import { Button, Card, Divider, IconButton, Screen, Text } from '@/components/ui';
import { RequestStatusBadge } from '@/components/requests';
import { useRequests } from '@/hooks';
import { color } from '@/theme';
import { formatInr, formatRelativeTime } from '@/utils/format';

export default function Home() {
  const { data: requests } = useRequests();
  const recent = (requests ?? []).slice(0, 3);

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

      <Card variant="raised" className="mt-4 bg-surface">
        <Text variant="label" className="text-text-secondary">
          SAMONA for you
        </Text>
        <Text variant="titleLg" className="mt-1">
          What do you need today?
        </Text>
        <Text variant="footnote" className="mt-1">
          Trusted professionals, at home, on time.
        </Text>
        <Button
          label="Book a professional"
          size="lg"
          className="mt-4 self-start"
          onPress={() => router.push('/booking/new')}
        />
      </Card>

      <View className="mt-6 flex-row items-center justify-between">
        <Text variant="title">Recent bookings</Text>
        <Text variant="footnote" className="text-brand" onPress={() => router.push('/bookings')}>
          See all
        </Text>
      </View>

      <View className="mt-3">
        {recent.length > 0 ? (
          <Card padded={false} className="overflow-hidden">
            {recent.map((request, index) => (
              <View key={request.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/booking/${request.id}`)}
                  className="active:bg-surface-muted"
                >
                  <View className="flex-row items-center gap-3 px-4 py-4">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text variant="bodyStrong" className="flex-shrink">
                          {request.service.name}
                        </Text>
                        <RequestStatusBadge status={request.status} />
                      </View>
                      <Text variant="caption" className="mt-0.5 text-text-muted">
                        {formatRelativeTime(request.updatedAt)} ·{' '}
                        {formatInr(request.finalPrice ?? request.estimatedPrice)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={color['text-muted']} />
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
        ) : (
          <Card className="min-h-[160px] justify-center">
            <EmptyState
              icon="calendar-outline"
              title="No bookings yet"
              message="When you book a professional, your active requests will appear here."
            />
          </Card>
        )}
      </View>
    </Screen>
  );
}