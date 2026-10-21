import { View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Text } from '@/components/ui';
import { color } from '@/theme';
import { useUnreadNotifications } from '@/hooks';

export interface NotificationBellProps {
  /** Use white styling for brand-colored headers. */
  variant?: 'default' | 'white';
}

/**
 * The home-screen bell with its unread pill.
 *
 * Opens the Notifications modal; the pill reflects the customer's own unread
 * count, moved live by `notification:unread` and back-stopped by a short poll
 * (see `useUnreadNotifications`).
 */
export function NotificationBell({ variant = 'default' }: NotificationBellProps) {
  const unread = useUnreadNotifications();
  const count = unread.data?.unreadCount ?? 0;
  const isWhite = variant === 'white';

  return (
    <View>
      <IconButton
        name="notifications-outline"
        accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
        tint={isWhite ? color['brand-contrast'] : color['text-primary']}
        className={isWhite ? 'bg-white/15' : undefined}
      />
      {count > 0 ? (
        <View
          pointerEvents="none"
          className="absolute right-0 top-0 min-w-[18px] items-center rounded-full bg-danger px-1 py-0.5"
        >
          <Text
            variant="caption"
            className="text-[10px] font-bold leading-[12px] text-text-inverse"
          >
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
