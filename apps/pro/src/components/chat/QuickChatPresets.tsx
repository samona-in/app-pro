import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { QUICK_CHAT_PRESETS } from '@/constants';
import { color } from '@/theme';

interface Props {
  /** Called with the chosen phrase; the screen drops it into the composer. */
  onSelect: (phrase: string) => void;
}

/**
 * Quick phrases the pro can drop into the composer while on a job, rendered as
 * a vertical list inside the thread body (rather than chips above the composer)
 * so they read as ready-to-send starters next to the messages.
 */
export function QuickChatPresets({ onSelect }: Props) {
  return (
    <View className="gap-1.5 px-4 pb-2 pt-1">
      {QUICK_CHAT_PRESETS.map((phrase) => (
        <Pressable
          key={phrase}
          accessibilityRole="button"
          accessibilityLabel={phrase}
          onPress={() => onSelect(phrase)}
          className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-surface px-4 active:opacity-70"
        >
          <Text variant="body" className="flex-1 text-text-secondary">
            {phrase}
          </Text>
          <Ionicons name="arrow-up-outline" size={16} color={color['text-muted']} />
        </Pressable>
      ))}
    </View>
  );
}