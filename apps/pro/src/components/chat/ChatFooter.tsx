import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { IconButton } from '@/components/ui';
import { color } from '@/theme';
import { QuickChatPresets } from './QuickChatPresets';

interface Props {
  /** Sends the draft; resolves when persisted (or rejects). */
  onSend: (content: string) => Promise<unknown>;
  /** Renders the one-tap quick-reply chips above the composer (Pro surface). */
  quickReplies?: boolean;
  disabled?: boolean;
}

/**
 * The chat composer. Multiline input with a primary send button; text survives
 * a failed send by being restored to the field. The Pro surface optionally
 * stacks one-tap quick-reply chips on top (the customer app has none).
 */
export function ChatFooter({ onSend, quickReplies = false, disabled = false }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !disabled;

  function handleSend() {
    if (!canSend) return;
    const text = trimmed;
    setDraft('');
    void onSend(text).catch(() => setDraft(text));
  }

  return (
    <View className="border-t border-border bg-surface">
      {quickReplies ? (
        <QuickChatPresets
          onSelect={(phrase) => {
            setDraft(phrase);
            inputRef.current?.focus();
          }}
        />
      ) : null}

      <View className="flex-row items-end gap-1 px-3 pb-2 pt-1">
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message"
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
          accessibilityLabel="Send message"
          haptic
          onPress={handleSend}
        />
      </View>
    </View>
  );
}