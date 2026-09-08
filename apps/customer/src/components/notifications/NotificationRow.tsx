import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerNotification, NotificationKind } from '@samona/types';
import { Text } from '@/components/ui';
import { useMarkNotificationRead } from '@/hooks';
import { color } from '@/theme';
import { formatRelativeTime } from '@/utils/format';

type KindStyle = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Token key used to tint the leading icon; keeps rows neutral like Profile. */
  tint: 'text-secondary' | 'text-muted';
};

const KIND_STYLES: Record<NotificationKind, KindStyle> = {
  JOB_ALERT: { icon: 'notifications', tint: 'text-secondary' },
  JOB_STATUS: { icon: 'briefcase-outline', tint: 'text-secondary' },
  PAYMENT: { icon: 'wallet', tint: 'text-secondary' },
  SYSTEM: { icon: 'information-circle-outline', tint: 'text-muted' },
};

export interface NotificationRowProps {
  notice: CustomerNotification;
}

/**
 * One notification row in the customer's Notifications screen.
 *
 * An unread row shows a brand dot and marks itself read on tap; the row then
 * opens the related booking when the notice carries a route. The read state is
 * optimistic in the list cache and reconciled by REST + the `notification:unread`
 * echo (see `useMarkNotificationRead`).
 */
export function NotificationRow({ notice }: NotificationRowProps) {
  const markRead = useMarkNotificationRead();
  const unread = notice.readAt === null;
  const style = KIND_STYLES[notice.kind];

  const handlePress = useCallback(() => {
    if (unread) markRead.mutate(notice.id);
    if (notice.route) router.push(notice.route);
  }, [markRead, notice, unread]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notice.title}. ${notice.body}`}
      accessibilityHint={notice.route ? 'Opens the related booking.' : undefined}
      onPress={handlePress}
      className="min-h-[64px] flex-row items-center px-4 active:opacity-60"
    >
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons name={style.icon} size={20} color={color[style.tint]} />
      </View>

      <View className="ml-3 min-w-0 flex-1">
        <View className="flex-row items-center">
          <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1 text-text-primary">
            {notice.title}
          </Text>
          {unread ? <View className="ml-2 h-2 w-2 shrink-0 rounded-full bg-brand" /> : null}
        </View>
        <Text variant="footnote" numberOfLines={1} className="mt-0.5 text-text-secondary">
          {notice.body}
        </Text>
      </View>

      <Text variant="caption" className="ml-2 shrink-0 self-end text-text-muted">
        {formatRelativeTime(notice.createdAt)}
      </Text>
    </Pressable>
  );
}
