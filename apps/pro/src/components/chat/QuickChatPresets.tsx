import { useState } from 'react';
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
 * Quick phrases the pro can drop into the composer while on a job. They render
 * as a narrow, titled column in the thread body styled like received message
 * bubbles (asymmetric corner, soft surface) with a send affordance. The header
 * collapses the list via its chevron.
 */
export function QuickChatPresets({ onSelect }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <View className="w-[85%] self-start rounded-2xl border border-border bg-surface pb-2 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse quick chat' : 'Open quick chat'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-1 self-start py-1.5 active:opacity-70"
      >
        <Text variant="label" className="text-text-secondary">
          Quick chat
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={color['text-muted']}
        />
      </Pressable>

      {open ? (
        <View className="gap-1.5 px-2.5 pb-1">
          {QUICK_CHAT_PRESETS.map((phrase) => (
            <Pressable
              key={phrase}
              accessibilityRole="button"
              accessibilityLabel={`${phrase}. Tap to add to your message`}
              onPress={() => onSelect(phrase)}
              className="flex-row items-center gap-2 self-start rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-2 active:opacity-70"
            >
              <Text variant="body" className="max-w-full flex-shrink text-text-primary">
                {phrase}
              </Text>
              <Ionicons name="send-outline" size={15} color={color['text-secondary']} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}