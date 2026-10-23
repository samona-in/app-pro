import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { NotificationRow } from '@/components/notifications';
import { Screen } from '@/components/ui';
import {
  useCustomerNotifications,
  useMarkAllNotificationsRead,
  useUnreadNotifications,
} from '@/hooks';

/**
 * The customer's notification inbox. Booking confirmations, status changes
 * and payment confirmations land here as in-app notices; tapping a row opens
 * the related booking. Opening the screen resets every notice to read once,
 * so the bell pill clears without the customer having to open each row.
 */
export default function Notifications() {
  const notices = useCustomerNotifications();
  const unread = useUnreadNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const markAllAttempted = useRef(false);

  const data = useMemo(() => notices.data ?? [], [notices.data]);

  // Mark everything read the moment the inbox opens. Fired once per screen
  // instance (a defence against inviting double taps under StrictMode), and
  // only when the server actually reports unread rows. Deferred past the first
  // frame so the optimistic cache update (setQueryData/invalidate) never lands
  // while the screen is still mounting, which Android warns about.
  useEffect(() => {
    if (markAllAttempted.current) return;
    if (!unread.isFetched || (unread.data?.unreadCount ?? 0) === 0) return;
    markAllAttempted.current = true;
    const frame = requestAnimationFrame(() => {
      markAllRead.mutate();
    });
    return () => cancelAnimationFrame(frame);
  }, [markAllRead, unread.data?.unreadCount, unread.isFetched]);

  const loading = notices.isPending || (notices.isFetching && data.length === 0);

  return (
    <Screen scrollable edges={['bottom']}>
      {loading ? (
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
      ) : data.length > 0 ? (
        <View className="mt-4">
          {data.map((notice) => (
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
