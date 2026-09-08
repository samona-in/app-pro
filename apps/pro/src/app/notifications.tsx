import { View } from 'react-native';
import { EmptyState, LoadingState } from '@/components/feedback';
import { NotificationCard } from '@/components/notifications';
import { Screen } from '@/components/ui';
import { useNotifications } from '@/hooks';

/**
 * The Pro's notification inbox. Job alerts, status changes and payouts land
 * here as push history; recurring job alerts collapse to a single row that
 * reports how many times it re-paged the Pro.
 */
export default function Notifications() {
  const { data: notifications, isPending } = useNotifications();

  return (
    <Screen scrollable edges={['bottom']}>
      {isPending ? (
        <View className="mt-10">
          <LoadingState message="Loading notifications" />
        </View>
      ) : (notifications?.length ?? 0) > 0 ? (
        <View className="mt-4 gap-3">
          {(notifications ?? []).map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
        </View>
      ) : (
        <View className="mt-10 flex-1">
          <EmptyState
            icon="notifications-outline"
            title="No notifications yet"
            message="Job requests, status updates and payout alerts will appear here."
          />
        </View>
      )}
    </Screen>
  );
}
