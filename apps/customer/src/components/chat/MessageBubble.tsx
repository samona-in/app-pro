import { View } from 'react-native';
import type { ChatMessage } from '@samona/types';
import { Text } from '@/components/ui';
import { color } from '@/theme';
import { formatChatTime } from '@/utils/format';
import { MessageStatusIcon } from './MessageStatusIcon';

interface Props {
  message: ChatMessage;
  isMine: boolean;
}

/**
 * One chat bubble. Mine is right-aligned on the brand tint with its receipt tick;
 * theirs is left-aligned on the muted surface. `max-w` keeps long messages from
 * running edge to edge; the asymmetric corner reads which side sent it.
 */
export function MessageBubble({ message, isMine }: Props) {
  return (
    <View className={`mb-2 ${isMine ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
          isMine ? 'rounded-br-md bg-brand-soft' : 'rounded-bl-md bg-surface-muted'
        }`}
      >
        <Text variant="body" className="text-text-primary">
          {message.content}
        </Text>
        <View className="mt-0.5 flex-row items-center justify-end gap-1">
          <Text variant="caption" style={{ color: color['text-muted'] }}>
            {formatChatTime(message.sentAt)}
          </Text>
          {isMine ? <MessageStatusIcon message={message} /> : null}
        </View>
      </View>
    </View>
  );
}