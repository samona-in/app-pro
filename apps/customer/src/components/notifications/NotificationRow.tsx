import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerNotification, NotificationKind } from '@samona/types';
import { Text } from '@/components/ui';
import { useMarkNotificationRead } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
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
  /**
   * Multi-select mode is on. The row shows a leading checkbox, tapping only
   * toggles the selection (never opens the notice), and the selected row gets
   * a subtle tint. When off, a tap marks read and opens the related booking.
   */
  selectionMode?: boolean;
  /** Whether this row is currently selected (renders only in selection mode). */
  selected?: boolean;
  /** Toggles this row's selection (used in selection mode). */
  onToggleSelect?: () => void;
  /** Called once when the row is long-pressed outside selection mode. */
  onEnterSelection?: () => void;
}

/**
 * One notification in the customer's Notifications screen — a borderless, flat
 * list row (no card). An unread row shows a brand-tinted icon and marks itself
 * read on tap; the row then opens the related booking when the notice carries a
 * route. The read state is optimistic in the list cache and reconciled by
 * REST + the `notification:unread` echo (see `useMarkNotificationRead`).
 *
 * In multi-select mode (see `selectionMode`) the row becomes a checkbox: long
 * presses only enter the mode — they never open the notice — and a tap toggles
 * the selection. The row's leading icon slot is fixed-width, so the checkbox
 * swaps in without shifting the content.
 */
export function NotificationRow({
  notice,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: NotificationRowProps) {
  const markRead = useMarkNotificationRead();
  const unread = notice.readAt === null;
  const { icon, tint } = KIND_ICON[notice.kind];

  const handlePress = useCallback(() => {
    if (selectionMode) {
      onToggleSelect?.();
      return;
    }
    if (unread) markRead.mutate(notice.id);
    if (notice.route) router.push(notice.route);
  }, [markRead, notice, onToggleSelect, selectionMode, unread]);

  const handleLongPress = useCallback(() => {
    // Long-pressing must never open the notice; it only starts selection.
    if (selectionMode) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onEnterSelection?.();
  }, [onEnterSelection, selectionMode]);

  return (
    <Pressable
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: selected } : undefined}
      accessibilityLabel={
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} ${notice.title}`
          : `${notice.title}. ${notice.body}`
      }
      accessibilityHint={
        selectionMode
          ? 'Toggles this notification.'
          : notice.route
            ? 'Opens the related booking.'
            : undefined
      }
      onPress={handlePress}
      onLongPress={handleLongPress}
      className={cn(
        'bg-background py-2 active:opacity-60',
        selectionMode && selected && 'bg-surface-muted/60',
      )}
    >
      <View className="flex-row items-center">
        {selectionMode ? (
          <View className="mr-3.5 w-6 items-center justify-center">
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? color.brand : color['text-muted']}
            />
          </View>
        ) : null}
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
