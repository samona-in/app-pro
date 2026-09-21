import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { AppNotification, NotificationKind } from '@samona/types';
import { Card, Text } from '@/components/ui';
import { color } from '@/theme';
import { cn } from '@/utils/cn';
import { formatRelativeTime } from '@/utils/format';

type Ionicon = keyof typeof Ionicons.glyphMap;

/** Maps a notification kind to a leading icon and its tint. */
const KIND_ICON: Record<NotificationKind, { icon: Ionicon; tint: string }> = {
  JOB_ALERT: { icon: 'briefcase-outline', tint: color.brand },
  JOB_STATUS: { icon: 'construct-outline', tint: color.info },
  PAYMENT: { icon: 'wallet-outline', tint: color.success },
  SYSTEM: { icon: 'shield-checkmark-outline', tint: color['text-muted'] },
};

/**
 * One entry in the Notifications screen. Recurring job alerts collapse to one
 * row — the leading icon flashes while the job is open and a `repeats` chip
 * (when it paged more than once) hints how insistent the alert was.
 */
export function NotificationCard({
  notification,
  className,
}: {
  notification: AppNotification;
  className?: string;
}) {
  const { t } = useTranslation();
  const { icon, tint } = KIND_ICON[notification.kind];
  const open = notification.resolvedAt === null;

  return (
    <Card className={cn('flex-row items-center gap-3', className)} padded={false}>
      <View className="p-2 pr-0">
        <Ionicons name={icon} size={22} color={open ? tint : color['text-muted']} />
      </View>
      <View className="flex-1 py-3 pr-4">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="bodyStrong" className="flex-1">
            {notification.title}
          </Text>
          <Text variant="caption" className="text-text-muted">
            {formatRelativeTime(notification.createdAt, t)}
          </Text>
        </View>
        <Text variant="footnote" className="mt-1 leading-4 text-text-secondary">
          {notification.body}
        </Text>
        {notification.repeats > 1 ? (
          <Text variant="caption" className="mt-1.5 text-brand">
            {t('notificationsCard.repeated', { count: notification.repeats })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
