import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerNotification, NotificationKind } from '@samona/types';
import { Text } from '@/components/ui';
import { useMarkNotificationRead } from '@/hooks';
import { color, type ColorTokens } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRelativeTime } from '@/utils/format';

/** Color tokens that hold a plain CSS color (tokens also carry the scales). */
type StringColorKey = {
  [K in keyof ColorTokens]: ColorTokens[K] extends string ? K : never;
}[keyof ColorTokens];

type KindStyle = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: StringColorKey;
  /** NativeWind background class for the leading icon chip. */
  surface: string;
};

const KIND_STYLES: Record<NotificationKind, KindStyle> = {
  JOB_ALERT: { icon: 'notifications', tint: 'brand-contrast', surface: 'bg-brand' },
  JOB_STATUS: { icon: 'briefcase-outline', tint: 'info', surface: 'bg-info-surface' },
  PAYMENT: { icon: 'wallet', tint: 'success', surface: 'bg-success-surface' },
  SYSTEM: {
    icon: 'information-circle-outline',
    tint: 'text-secondary',
    surface: 'bg-surface-muted',
  },
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
      className="flex-row items-start rounded-xl border border-border bg-surface p-4 active:opacity-70"
    >
      <View className={cn('h-10 w-10 items-center justify-center rounded-full', style.surface)}>
        <Ionicons name={style.icon} size={20} color={color[style.tint]} />
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            className={cn('flex-1', unread && 'text-text-primary')}
          >
            {notice.title}
          </Text>
          <Text variant="caption" className="shrink-0 text-text-muted">
            {formatRelativeTime(notice.createdAt)}
          </Text>
        </View>
        <Text variant="body" numberOfLines={2} className="mt-0.5 text-text-secondary">
          {notice.body}
        </Text>
      </View>

      {unread ? <View className="ml-2 mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" /> : null}
    </Pressable>
  );
}
