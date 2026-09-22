import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
 * as a narrow, titled column in the thread body styled like message bubbles
 * (uniform radius, soft surface) with a send affordance. The header collapses
 * the list via its chevron.
 */
export function QuickChatPresets({ onSelect }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <View className="mt-3 w-[85%] self-end rounded-2xl border border-border bg-surface pb-2 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? t('chat.quickChatA11yCollapse') : t('chat.quickChatA11yOpen')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between px-4 py-1.5 active:opacity-70"
      >
        <Text variant="label" className="text-text-secondary">
          {t('chat.quickChatTitle')}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={color['text-muted']}
        />
      </Pressable>

      {open ? (
        <View className="gap-1.5 px-2.5 pb-1">
          {QUICK_CHAT_PRESETS.map((phraseKey) => {
            const phrase = t(phraseKey);
            return (
              <Pressable
                key={phraseKey}
                accessibilityRole="button"
                accessibilityLabel={t('chat.phraseA11y', { phrase })}
                onPress={() => onSelect(phrase)}
                className="flex-row items-center gap-2 rounded-2xl bg-surface-muted px-3.5 py-2 active:opacity-70"
              >
                <Text variant="body" className="flex-1 text-text-primary">
                  {phrase}
                </Text>
                <Ionicons name="send-outline" size={15} color={color['text-secondary']} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}