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
 * Opening the inbox advances the local "seen" watermark the Home bell uses, so
 * the badge clears only after the Pro has actually looked at the list.
 */
export default function Notifications() {
  const { t } = useTranslation();
  const { data: notifications, isPending } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      if (!notifications) return;
      void markNotificationsSeen(latestNotificationAt(notifications));
    }, [notifications]),
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
