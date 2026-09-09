import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UnreadBadge } from '@/components/chat';
import { color } from '@/theme';

/**
 * Compound "call + message" contact button shown opposite the header title
 * throughout the job screens. A chat-bubble glyph with a small call badge reads
 * as both ways to reach the customer; the 44pt surface circle keeps it
 * consistent with IconButton. Pressing opens the job actions screen
 * (contact / cancel). The red dot in the corner carries how many customer
 * messages are still unread.
 */
export function CallMessageButton({ jobId, unread }: { jobId: string; unread: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Job actions"
      onPress={() => router.push({ pathname: '/job/[id]/contact', params: { id: jobId } })}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
    >
      <View>
        <Ionicons name="chatbubble-ellipses" size={22} color={color.brand} />
        <View className="absolute -bottom-1 -right-2 h-5 w-5 items-center justify-center rounded-full bg-brand">
          <Ionicons name="call" size={11} color={color['brand-contrast']} />
        </View>
      </View>
      <UnreadBadge count={unread} className="absolute -right-1 -top-1" />
    </Pressable>
  );
}