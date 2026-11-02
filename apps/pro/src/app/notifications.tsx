import { useCallback } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, LoadingState } from '@/components/feedback';
import { NotificationCard } from '@/components/notifications';
import { Divider, Screen } from '@/components/ui';
import { useNotifications } from '@/hooks';
import {
  latestNotificationAt,
  markNotificationsSeen,
} from '@/hooks/use-notifications-unread';

/**
 * The Pro's notification inbox. Job alerts, status changes and payouts land
 * here as push history; recurring job alerts collapse to a single row that
 * reports how many times it re-paged the Pro.
 *
 * Opening the inbox is the acknowledgement: it advances the local "seen"
 * watermark the Home bell reads, so the unread badge resets as soon as the Pro
 * views the list. The page is refreshed first so the watermark also covers the
 * newest row, even when the cached page was stale.
 */
export default function Notifications() {
  const { t } = useTranslation();
  const { data: notifications, isPending, refetch } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      // Clear the bell immediately; the page may still be cached or empty, and
      // waiting for a fetch would leave the badge up while the Pro is reading.
      void markNotificationsSeen(new Date().toISOString());

      // Then refresh and fold in the freshest row. Its server timestamp can be
      // ahead of this device's clock, so the watermark must move to it as well.
      void refetch()
        .then((result) => {
          const latest = latestNotificationAt(result.data ?? []);
          if (latest) void markNotificationsSeen(latest);
        })
        .catch(() => undefined);
    }, [refetch]),
  );

  return (
    <Screen scrollable edges={['bottom']}>
      {isPending ? (
        <View className="mt-10">
          <LoadingState message={t('notificationsScreen.loading')} />
        </View>
      ) : (notifications?.length ?? 0) > 0 ? (
        <View className="mt-2">
          {(notifications ?? []).map((notification, index) => (
            <View key={notification.id}>
              {index > 0 ? <Divider className="-mx-5" /> : null}
              <NotificationCard notification={notification} />
            </View>
          ))}
        </View>
      ) : (
        <View className="mt-10 flex-1">
          <EmptyState
            icon="notifications-outline"
            title={t('notificationsScreen.emptyTitle')}
            message={t('notificationsScreen.emptyMessage')}
          />
        </View>
      )}
    </Screen>
  );
}
