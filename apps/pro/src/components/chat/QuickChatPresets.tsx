import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui';
import { QUICK_CHAT_PRESETS } from '@/constants';

interface Props {
  /** Called with the chosen phrase; the footer drops it into the composer. */
  onSelect: (phrase: string) => void;
}

/** One-tap phrases the pro can drop into the composer while on a job. */
export function QuickChatPresets({ onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row gap-2 px-4 py-2">
        {QUICK_CHAT_PRESETS.map((phrase) => (
          <Pressable
            key={phrase}
            accessibilityRole="button"
            accessibilityLabel={phrase}
            onPress={() => onSelect(phrase)}
            className="min-h-[36px] items-center justify-center rounded-full border border-border-strong bg-surface px-3.5 active:opacity-70"
          >
            <Text variant="footnote" className="text-text-secondary">
              {phrase}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}