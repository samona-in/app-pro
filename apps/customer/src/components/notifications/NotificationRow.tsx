import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerNotification, NotificationKind } from '@samona/types';
import { Text } from '@/components/ui';
import { useMarkNotificationRead } from '@/hooks';
import { color } from '@/theme';
import { formatRelativeTime } from '@/utils/format';

type Ionicon = keyof typeof Ionicons.glyphMap;

/** Maps a notification kind to a leading icon and its tint, like the Pro app. */
const KIND_ICON: Record<NotificationKind, { icon: Ionicon; tint: string }> = {
  JOB_ALERT: { icon: 'briefcase-outline', tint: color.brand },
  JOB_STATUS: { icon: 'construct-outline', tint: color.brand },
  PAYMENT: { icon: 'wallet-outline', tint: color.success },
  SYSTEM: { icon: 'shield-checkmark-outline', tint: color['text-muted'] },
};

export interface NotificationRowProps {
  notice: CustomerNotification;
}

/**
 * One notification in the customer's Notifications screen — a borderless, flat
 * list row (no card). An unread row shows a brand-tinted icon and marks itself
 * read on tap; the row then opens the related booking when the notice carries a
 * route. The read state is optimistic in the list cache and reconciled by
 * REST + the `notification:unread` echo (see `useMarkNotificationRead`).
 */
export function NotificationRow({ notice }: NotificationRowProps) {
  const markRead = useMarkNotificationRead();
  const unread = notice.readAt === null;
  const { icon, tint } = KIND_ICON[notice.kind];

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
      className="bg-surface py-2 active:opacity-60"
    >
      <View className="flex-row items-center">
        <View className="mr-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted">
          <Ionicons name={icon} size={22} color={unread ? tint : color['text-muted']} />
        </View>
        <View className="min-w-0 flex-1 py-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
              {notice.title}
            </Text>
            <Text variant="caption" className="shrink-0 text-text-muted">
              {formatRelativeTime(notice.createdAt)}
            </Text>
          </View>
          <Text variant="footnote" numberOfLines={2} className="mt-1 leading-4 text-text-secondary">
            {notice.body}
          </Text>
        </View>
      </View>

      {/* Thin divider between list rows, bleeding to the screen edges. */}
      <View className="my-2 -mx-5 h-px bg-border" />
    </Pressable>
  );
}
