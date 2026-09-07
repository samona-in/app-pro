import { z } from 'zod';
import { idSchema } from './primitives';

/**
 * Input schemas for the messages domain, shared by the apps and the API.
 *
 * Nothing here is trusted as identity — the server derives who is talking from
 * the verified token and which job the message is posted to
 * (CLAUDE.md "Security"). The body holds only content and the thread anchor.
 */
export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty.')
  .max(500, 'Keep the message under 500 characters.');

export type MessageContent = z.infer<typeof messageContentSchema>;

/** Posts one message to a job conversation. */
export const sendMessageSchema = z.object({
  jobId: idSchema,
  content: messageContentSchema,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Acks every still-unacknowledged message from the other party of a job as
 * either delivered or read. Delivered and read share this body; only the route
 * differs by what timestamp it writes.
 */
export const markMessagesReceivedSchema = z.object({
  jobId: idSchema,
});

export type MarkMessagesReceivedInput = z.infer<typeof markMessagesReceivedSchema>;

/**
 * Lists a job conversation, oldest first in chat reading order. `before` anchors
 * an older page (the oldest message id currently on screen); null loads the
 * newest page to fill the viewport.
 */
export const messageListQuerySchema = z.object({
  jobId: idSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: idSchema.optional(),
});

export type MessageListQuery = z.infer<typeof messageListQuerySchema>;