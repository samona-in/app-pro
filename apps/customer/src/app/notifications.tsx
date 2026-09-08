import { ScrollView, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { NotificationRow } from '@/components/notifications';
import { Card, Divider, Screen } from '@/components/ui';
import { useCustomerNotifications } from '@/hooks';

export default function Notifications() {
  const notices = useCustomerNotifications();

  return (
    <Screen edges={[]}>
      {notices.isPending ? (
        <View className="flex-1 justify-center">
          <LoadingState message="Loading notifications" size="inline" />
        </View>
      ) : notices.isError ? (
        <View className="flex-1 justify-center">
          <ErrorState
            title="Couldn't load notifications"
            message="Check your connection and try again."
            onRetry={() => void notices.refetch()}
          />
        </View>
      ) : !notices.data || notices.data.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications yet"
          message="Booking confirmations, status updates and reminders will appear here."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
          <Card className="mt-4" padded={false}>
            {notices.data.map((notice, index) => (
              <View key={notice.id}>
                {index > 0 ? <Divider /> : null}
                <NotificationRow notice={notice} />
              </View>
            ))}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
