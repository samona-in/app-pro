import { View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { NotificationRow } from '@/components/notifications';
import { Screen, Text } from '@/components/ui';
import { useCustomerNotifications } from '@/hooks';

/**
 * The customer's notification inbox. Booking confirmations, status changes
 * and payment confirmations land here as in-app notices; tapping a row opens
 * the related booking. Mirrors the Pro app's Notifications screen.
 */
export default function Notifications() {
  const notices = useCustomerNotifications();

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">Notifications</Text>
      </View>
      {notices.isPending ? (
        <View className="mt-10">
          <LoadingState message="Loading notifications" />
        </View>
      ) : notices.isError ? (
        <View className="mt-10">
          <ErrorState
            title="Couldn't load notifications"
            message="Check your connection and try again."
            onRetry={() => void notices.refetch()}
          />
        </View>
      ) : (notices.data?.length ?? 0) > 0 ? (
        <View className="mt-4">
          {(notices.data ?? []).map((notice) => (
            <NotificationRow key={notice.id} notice={notice} />
          ))}
        </View>
      ) : (
        <View className="mt-10 flex-1">
          <EmptyState
            icon="notifications-outline"
            title="No notifications yet"
            message="Booking confirmations, status updates and reminders will appear here."
          />
        </View>
      )}
    </Screen>
  );
}
