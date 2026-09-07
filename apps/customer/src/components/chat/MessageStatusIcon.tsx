import { Ionicons } from '@expo/vector-icons';
import { messageStatus, type ChatMessage } from '@samona/types';
import { color } from '@/theme';

interface Props {
  message: ChatMessage;
}

/**
 * The WhatsApp-style tick for one of the caller's own messages: clock while the
 * optimistic placeholder waits, then single tick → double tick → double blue.
 * Only the sender renders a status, so this is always placed on `isMine`.
 */
export function MessageStatusIcon({ message }: Props) {
  const status = messageStatus({
    readAt: message.readAt,
    deliveredAt: message.deliveredAt,
    isLocal: message.id.startsWith('local:'),
  });

  if (status === 'sending') {
    return <Ionicons name="time-outline" size={12} color={color['text-muted']} />;
  }

  const done = status === 'delivered' || status === 'read';
  const tint = status === 'read' ? color.blue[500] : color['text-muted'];
  return <Ionicons name={done ? 'checkmark-done' : 'checkmark'} size={14} color={tint} />;
}