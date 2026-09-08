import type { ChatMessage, MessagePage, MessageUnreadSummary } from '@samona/types';
import type { SendMessageInput } from '@samona/validation';
import { api } from './api';

/**
 * Typed chat requests for the pro surface, mounted at `/messages`.
 *
 * REST stays the source of truth (CLAUDE.md "Realtime"); the realtime events
 * in `services/realtime.ts` only bridge new messages and receipts into the
 * cache that these functions back.
 */
export const messagesApi = {
  /** The job's thread, newest page first ordered oldest-to-newest. */
  list: (jobId: string, options: { limit?: number; before?: string } = {}) =>
    api.get<MessagePage>('/messages', { query: { jobId, ...options } }),

  /** The caller's per-job unread chat counts (nonzero entries only). */
  unreadCounts: () => api.get<MessageUnreadSummary>('/messages/unread-counts'),

  /** Sends one message; the server anchors sender and job. */
  send: (input: SendMessageInput) => api.post<ChatMessage>('/messages', input),

  /** Acknowledges the recipient device saw the thread; idempotent server-side. */
  markDelivered: (jobId: string) => api.post<undefined>('/messages/delivered', { jobId }),

  /** Marks the thread read (implies delivered); idempotent server-side. */
  markRead: (jobId: string) => api.post<undefined>('/messages/read', { jobId }),
};
