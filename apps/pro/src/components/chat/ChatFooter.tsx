import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { color } from '@/theme';

interface Props {
  /** The draft text, owned by the screen so quick replies can fill it. */
  draft: string;
  onChangeDraft: (text: string) => void;
  /** Sends the draft; resolves when persisted (or rejects). */
  onSend: (content: string) => Promise<unknown>;
  disabled?: boolean;
}

/**
 * The chat composer. Multiline input with a primary send button; text survives
 * a failed send by being restored to the field. The draft lives on the screen
 * (lifted) so the quick-reply list in the thread body can fill it.
 */
export function ChatFooter({ draft, onChangeDraft, onSend, disabled = false }: Props) {
  const { t } = useTranslation();
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !disabled;

  function handleSend() {
    if (!canSend) return;
    const text = trimmed;
    onChangeDraft('');
    void onSend(text).catch(() => onChangeDraft(text));
  }

  return (
    <View className="bg-surface">
      <View className="flex-row items-end gap-2 px-4 pb-3 pt-2">
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={color['text-muted']}
          multiline
          maxLength={500}
          editable={!disabled}
          className="max-h-[120px] min-h-[44px] flex-1 rounded-2xl bg-surface-muted px-4 py-2.5 text-body text-text-primary"
        />
        <IconButton
          name="send"
          size={22}
          tint={canSend ? color.brand : color['text-muted']}
          disabled={!canSend}
          accessibilityLabel={t('chat.sendA11y')}
          haptic
          onPress={handleSend}
        />
      </View>
    </View>
  );
}