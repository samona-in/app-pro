/**
 * Job-scoped chat between a customer and the professional on their job.
 *
 * A conversation is implicit: it is the set of messages on one `Job`. There is
 * no separate thread row. Messaging is only meaningful once a job has both
 * parties (a pro accepted it), which the server enforces.
 */

/** The clock → single tick → double tick → double-blue tick progression. */
export const MessageStatus = {
  /** Not yet acknowledged by the server — the optimistic placeholder. */
  SENDING: 'sending',
  /** Persisted by the server; not yet known to have reached the recipient. */
  SENT: 'sent',
  /** The recipient's device confirmed delivery. */
  DELIVERED: 'delivered',
  /** The recipient's app marked the message as read. */
  READ: 'read',
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

/**
 * One message in a job conversation, as shared by REST and the realtime channel.
 *
 * `senderId` is the `Profile` id (equals `auth.users.id`), so either party can
 * tell "mine" from "theirs" by comparing against their own session user id.
 * `deliveredAt` / `readAt` are the receipt timestamps that drive the status
 * icons on the sender's side; they stay null until the recipient acks.
 */
export interface ChatMessage {
  id: string;
  jobId: string;
  senderId: string;
  content: string;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

/** A page of a job conversation, oldest first (chat reading order). */
export interface MessagePage {
  messages: ChatMessage[];
  /** The id of the next older page's anchor; null when the thread is exhausted. */
  nextCursor: string | null;
}

/**
 * Realtime receipt payload telling the sender which of their messages a
 * recipient delivered or read. Delivered and read share this shape.
 */
export interface MessageReceiptUpdate {
  jobId: string;
  messageIds: string[];
}

/**
 * Derives the WhatsApp-style status for one of the caller's own messages.
 *
 * `isLocal` marks the optimistic placeholder created before the server
 * acknowledged the send — it renders the clock. A persisted message starts at
 * `sent` and is promoted to `delivered`/`read` as its receipt timestamps land.
 */
export function messageStatus({
  readAt,
  deliveredAt,
  isLocal,
}: {
  readAt: string | null;
  deliveredAt: string | null;
  isLocal: boolean;
}): MessageStatus {
  if (readAt) return MessageStatus.READ;
  if (deliveredAt) return MessageStatus.DELIVERED;
  if (isLocal) return MessageStatus.SENDING;
  return MessageStatus.SENT;
}

/** A message whose id the client knows a receipt arrived for (fast path). */
export function receiptIsFor(update: MessageReceiptUpdate, messageId: string): boolean {
  return update.messageIds.includes(messageId);
}