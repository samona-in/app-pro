import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { NotificationRow } from '@/components/notifications';
import { IconButton, Screen, Text } from '@/components/ui';
import {
  useCustomerNotifications,
  useDeleteNotifications,
  useMarkAllNotificationsRead,
  useUnreadNotifications,
} from '@/hooks';
import { color } from '@/theme';

/**
 * The customer's notification inbox. Booking confirmations, status changes
 * and payment confirmations land here as in-app notices; tapping a row opens
 * the related booking. Opening the screen resets every notice to read once,
 * so the bell pill clears without the customer having to open each row.
 *
 * Long-pressing a row enters multi-select mode: a checkbox appears on every
 * row, the header title becomes "N selected" with a trash button, and the
 * trash flow confirms and permanently deletes the selected notices.
 */
export default function Notifications() {
  const notices = useCustomerNotifications();
  const unread = useUnreadNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const markAllAttempted = useRef(false);

  const navigation = useNavigation();
  const deleteNotifications = useDeleteNotifications();

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const data = useMemo(() => notices.data ?? [], [notices.data]);
  const selectedCount = selectedIds.size;
  const selectionMode = selectedCount > 0;

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

  /** Only rows the caller still owns are ever deleted, so selections stay valid. */
  const liveSelections = useCallback(
    () => [...selectedIds].filter((id) => data.some((n) => n.id === id)),
    [data, selectedIds],
  );

  const confirmDelete = useCallback(() => {
    void (async () => {
      const ids = liveSelections();
      if (ids.length === 0) return;
      Alert.alert(
        `Delete ${ids.length} notification${ids.length === 1 ? '' : 's'}?`,
        `Are you sure you want to delete these ${ids.length} notification${ids.length === 1 ? '' : 's'}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await deleteNotifications.mutateAsync(ids);
                  setSelectedIds(() => new Set());
                } catch (error) {
                  Alert.alert(
                    'Could not delete notifications',
                    error instanceof Error ? error.message : 'Please try again.',
                  );
                }
              })();
            },
          },
        ],
      );
    })();
  }, [deleteNotifications, liveSelections]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const enterSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Selection mode reshapes the native header: the title becomes the selected
  // count (kept on the left), the back/close control hides, and a trash button
  // replaces the count's right edge. Exiting restores the router's own options.
  useEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        title: undefined,
        headerTitle: () => (
          <Text className="ml-2" variant="bodyStrong">
            {selectedCount} selected
          </Text>
        ),
        headerLeft: () => null,
        headerRight: () => (
          <IconButton
            name="trash-outline"
            tint={color.danger}
            haptic
            accessibilityLabel="Delete selected notifications"
            onPress={confirmDelete}
          />
        ),
      });
    } else {
      navigation.setOptions({
        title: 'Notifications',
        headerTitle: undefined,
        headerLeft: undefined,
        headerRight: undefined,
      });
    }
  }, [confirmDelete, navigation, selectedCount, selectionMode]);

  return (
    <Screen scrollable edges={['bottom']}>
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
      ) : data.length > 0 ? (
        <View className="mt-4">
          {data.map((notice) => (
            <NotificationRow
              key={notice.id}
              notice={notice}
              selectionMode={selectionMode}
              selected={selectedIds.has(notice.id)}
              onToggleSelect={() => toggleSelection(notice.id)}
              onEnterSelection={() => enterSelection(notice.id)}
            />
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
