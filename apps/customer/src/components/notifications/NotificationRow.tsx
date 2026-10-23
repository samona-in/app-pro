import { useCallback } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerNotification, NotificationKind } from '@samona/types';
import { Text } from '@/components/ui';
import { useDeleteNotification, useMarkNotificationRead } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatNotificationTime } from '@/utils/notifications';
import { NotificationRowMenu } from './NotificationRowMenu';

type Ionicon = keyof typeof Ionicons.glyphMap;

/**
 * Maps a notification kind to its leading icon plus the tile tint it wears
 * while the row is new. A read row drops back to the muted surface tile.
 */
const KIND_ICON: Record<NotificationKind, { icon: Ionicon; tint: string; tile: string }> = {
  JOB_ALERT: { icon: 'briefcase-outline', tint: color.brand, tile: 'bg-brand-soft' },
  JOB_STATUS: { icon: 'construct-outline', tint: color.brand, tile: 'bg-brand-soft' },
  PAYMENT: { icon: 'wallet-outline', tint: color.success, tile: 'bg-success-surface' },
  SYSTEM: {
    icon: 'shield-checkmark-outline',
    tint: color['text-secondary'],
    tile: 'bg-surface-muted',
  },
};

export interface NotificationRowProps {
  notice: CustomerNotification;
  /**
   * Whether the row reads as new. Defaults to the notice's own `readAt`; the
   * inbox passes it explicitly so the row can paint from the list it was given
   * without re-deriving state.
   */
  unread?: boolean;
  /** Draw the inset hairline above the row — every row but a group's first. */
  showDivider?: boolean;
}

/**
 * One notification in the customer's inbox — a quiet, borderless list row.
 *
 * The leading tile is the row's only colour: brand for booking news, green for
 * money, muted for system notices; it lights up while the notice is new and
 * settles to grey once read. The divider is inset to the text column rather
 * than run edge to edge, which is what makes the list read as type, not boxes.
 *
 * Tapping marks the notice read (optimistically, via the list cache) and then
 * opens its route when the notice carries one. The trailing three-dot menu
 * offers the same "View" action, plus "Delete" (confirmed, then removed from
 * the list optimistically).
 */
export function NotificationRow({
  notice,
  unread = notice.readAt === null,
  showDivider = false,
}: NotificationRowProps) {
  const markRead = useMarkNotificationRead();
  const { mutate: deleteNotification } = useDeleteNotification();
  const { icon, tint, tile } = KIND_ICON[notice.kind];
  const time = formatNotificationTime(notice.createdAt);

  const handleView = useCallback(() => {
    // `readAt` is the server's state; the painted `unread` prop may lag it.
    if (notice.readAt === null) markRead.mutate(notice.id);
    if (notice.route) router.push(notice.route);
  }, [markRead, notice]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete notification?',
      'This removes it from your inbox. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteNotification(notice.id, {
              onError: () => {
                Alert.alert('Unable to delete notification', 'Please try again.');
              },
            });
          },
        },
      ],
    );
  }, [deleteNotification, notice.id]);

  return (
    <View className="relative bg-surface">
      {showDivider ? (
        <View className="absolute left-[77px] right-5 top-0 h-px bg-border/60" />
      ) : null}

      <View className="flex-row items-start px-5 py-[13px]">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notice.title}. ${notice.body}. ${time}${unread ? '. Unread' : ''}`}
          accessibilityHint={notice.route ? 'Opens the related booking.' : undefined}
          onPress={handleView}
          className="min-w-0 flex-1 flex-row items-start active:opacity-60"
        >
          <View
            className={cn(
              'h-11 w-11 items-center justify-center rounded-[14px]',
              unread ? tile : 'bg-surface-muted',
            )}
          >
            <Ionicons name={icon} size={21} color={unread ? tint : color['text-muted']} />
          </View>

          <View className="ml-[13px] min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={1}
                className={cn('flex-1', unread ? 'font-bold' : 'font-semibold')}
              >
                {notice.title}
              </Text>
              {unread ? <View className="h-[7px] w-[7px] rounded-full bg-brand" /> : null}
              <Text
                variant="caption"
                className="shrink-0"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {time}
              </Text>
            </View>

            <Text variant="footnote" numberOfLines={2} className="mt-1">
              {notice.body}
            </Text>
          </View>
        </Pressable>

        {/*
         * The menu gets its own gap instead of butting up against the time:
         * 8px of separation, a 32px box whose centre sits on the title line
         * (row padding 13 + half of the 22px line − half of 32), and a small
         * negative right margin so the glyph stays optically flush.
         */}
        <View className="-mr-2 -mt-[5px] ml-2">
          <NotificationRowMenu
            noticeTitle={notice.title}
            onView={handleView}
            onDelete={handleDelete}
          />
        </View>
      </View>
    </View>
  );
}
