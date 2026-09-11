import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color } from '@/theme';

/**
 * Read-only footer shown in place of the composer once a job's conversation is
 * closed (PAID / CANCELLED / EXPIRED). History stays visible; sending is off.
 */
export function ConversationClosed() {
  return (
    <View className="items-center border-t border-border bg-surface px-4 py-4">
      <Ionicons name="lock-closed-outline" size={18} color={color['text-muted']} />
      <Text variant="footnote" className="mt-1 text-center text-text-secondary">
        This conversation is closed. You can no longer send messages.
      </Text>
    </View>
  );
}