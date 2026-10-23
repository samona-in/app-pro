import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ErrorState } from '@/components/feedback';
import { NotificationRow, NotificationSkeleton } from '@/components/notifications';
import { IconButton, Screen, Text } from '@/components/ui';
import {
  useCustomerNotifications,
  useMarkAllNotificationsRead,
  useUnreadNotifications,
} from '@/hooks';
import { groupNotificationsByDay } from '@/utils/notifications';

/**
 * The customer's notification inbox. Booking confirmations, status changes
 * and payment confirmations land here as in-app notices; tapping a row opens
 * the related booking.
 *
 * The feed is grouped by day like a mail client. Notices are acknowledged on
 * the way out rather than on open, so "new" means something while the customer
 * is reading: the dots survive until they leave, then the whole page clears in
 * one call and the bell pill empties.
 */
export default function Notifications() {
  const notices = useCustomerNotifications();
  const unread = useUnreadNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const data = useMemo(() => notices.data ?? [], [notices.data]);
  const groups = useMemo(() => groupNotificationsByDay(data), [data]);
  const newCount = useMemo(() => data.filter((notice) => notice.readAt === null).length, [data]);

  // Acknowledge the page when the modal goes away. The flag lives in a ref so
  // the unmount cleanup reads the latest count, and the timer lets a
  // StrictMode remount cancel the acknowledgement instead of marking the inbox
  // read the moment it opens in development.
  const shouldMarkAllOnClose = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shouldMarkAllOnClose.current = (unread.data?.unreadCount ?? 0) > 0 || newCount > 0;
  }, [newCount, unread.data?.unreadCount]);

  const markAll = markAllRead.mutate;
  useEffect(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    return () => {
      if (!shouldMarkAllOnClose.current) return;
      closeTimer.current = setTimeout(() => markAll(), 0);
    };
  }, [markAll]);

  const handleMarkAllRead = useCallback(() => {
    markAll();
  }, [markAll]);

  const loading = notices.isPending || (notices.isFetching && data.length === 0);
  // A blank subtitle (rather than "Nothing yet") keeps the header honest while
  // the first page is still on its way or has just failed.
  const subtitle =
    newCount > 0
      ? `${newCount} new`
      : data.length > 0
        ? `${data.length} notification${data.length === 1 ? '' : 's'}`
        : ' ';

  return (
    <Screen scrollable padded={false} edges={['top', 'bottom']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View className="px-5 pt-4">
        <View className="flex-row items-center justify-between">
          <Text variant="display">Notifications</Text>
          <IconButton
            name="close"
            accessibilityLabel="Close notifications"
            variant="surface"
            size={18}
            onPress={() => router.back()}
          />
        </View>

        <View className="mt-1 flex-row items-center justify-between">
          <Text variant="footnote">{subtitle}</Text>
          {newCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              accessibilityState={{ disabled: markAllRead.isPending }}
              disabled={markAllRead.isPending}
              hitSlop={12}
              onPress={handleMarkAllRead}
              className="py-1 active:opacity-60"
            >
              <Text variant="action">Mark all read</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {loading ? (
        <NotificationSkeleton />
      ) : notices.isError ? (
        <View className="mt-10">
          <ErrorState
            title="Couldn't load notifications"
            message="Check your connection and try again."
            onRetry={() => void notices.refetch()}
          />
        </View>
      ) : groups.length === 0 ? (
        <View className="mt-10 flex-1">
          <EmptyState
            icon="notifications-outline"
            title="No notifications yet"
            message="Booking confirmations, status updates and reminders will appear here."
          />
        </View>
      ) : (
        <View>
          {groups.map((group) => (
            <View key={group.key}>
              <View className="flex-row items-center gap-3 px-5 pb-1.5 pt-6">
                <Text variant="caption" className="font-bold uppercase tracking-[0.12em]">
                  {group.label}
                </Text>
                <View className="h-px flex-1 bg-border/60" />
              </View>

              {group.items.map((notice, index) => (
                <NotificationRow
                  key={notice.id}
                  notice={notice}
                  unread={notice.readAt === null}
                  showDivider={index > 0}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
