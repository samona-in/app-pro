/**
 * Job-scoped chat between a customer and the professional on their job.
 *
 * A conversation is implicit: it is the set of messages on one `Job`. There is
 * no separate thread row. Messaging is only meaningful once a job has both
 * parties (a pro accepted it), which the server enforces.
 */

import { type UserRole } from './user';

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
  /**
   * Which side of the job sent this — `CUSTOMER` or `PRO`. This is the
   * reliable way to tell "mine" from "theirs": the same account can be both
   * the customer and the pro of one job (one phone number on two apps), when
   * an id comparison would think every message was sent by me.
   */
  senderRole: UserRole;
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
  /**
   * The role that authored the acknowledged messages. Only the surface acting
   * as that role has sent messages to render these ticks on; the other surface
   * of the same account must ignore the event.
   */
  senderRole: UserRole;
}

/**
 * Live "unread" state for one job thread, as seen from one surface of the job.
 *
 * Delivered by REST (`GET /messages/unread-counts`) and kept fresh by the
 * `message:unread` realtime event. A badge disappears when the count reaches
 * zero — which happens when the receiving side opens the thread (its app sends
 * `POST /messages/read`).
 */
export interface MessageUnreadUpdate {
  jobId: string;
  unreadCount: number;
  /** The role whose badge this event updates; surfaces of the same account independently. */
  recipientRole: UserRole;
}

/** REST response: the caller's per-job unread counts, nonzero entries only. */
export interface MessageUnreadSummary {
  items: Array<{ jobId: string; unreadCount: number }>;
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
