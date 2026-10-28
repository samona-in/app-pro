import { z } from 'zod';
/**
 * Input schemas for the messages domain, shared by the apps and the API.
 *
 * Nothing here is trusted as identity — the server derives who is talking from
 * the verified token and which job the message is posted to
 * (CLAUDE.md "Security"). The body holds only content and the thread anchor.
 */
export declare const messageContentSchema: z.ZodString;
export type MessageContent = z.infer<typeof messageContentSchema>;
/** Posts one message to a job conversation. */
export declare const sendMessageSchema: z.ZodObject<{
    jobId: z.ZodUUID;
    content: z.ZodString;
}, z.core.$strip>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
/**
 * Acks every still-unacknowledged message from the other party of a job as
 * either delivered or read. Delivered and read share this body; only the route
 * differs by what timestamp it writes.
 */
export declare const markMessagesReceivedSchema: z.ZodObject<{
    jobId: z.ZodUUID;
}, z.core.$strip>;
export type MarkMessagesReceivedInput = z.infer<typeof markMessagesReceivedSchema>;
/**
 * Lists a job conversation, oldest first in chat reading order. `before` anchors
 * an older page (the oldest message id currently on screen); null loads the
 * newest page to fill the viewport.
 */
export declare const messageListQuerySchema: z.ZodObject<{
    jobId: z.ZodUUID;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    before: z.ZodOptional<z.ZodUUID>;
}, z.core.$strip>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
//# sourceMappingURL=message.d.ts.map