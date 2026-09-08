import { View } from 'react-native';
import { Text } from '@/components/ui';
import { cn } from '@/utils/cn';

/**
 * The compact red unread pill shown on chat entry points.
 *
 * Renders nothing at zero so callers can mount it unconditionally. Counts cap
 * at "9+" so the badge can never grow into a layout. Sized to overlap the
 * corner of the badge's host (a button, a card, or an icon).
 */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <View
      accessibilityLabel={`${count} unread messages`}
      className={cn('min-w-5 items-center justify-center rounded-full bg-danger px-1.5', className)}
      style={{ height: 20 }}
    >
      <Text variant="caption" className="font-bold text-white">
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}
