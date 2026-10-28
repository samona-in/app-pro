"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageListQuerySchema = exports.markMessagesReceivedSchema = exports.sendMessageSchema = exports.messageContentSchema = void 0;
const zod_1 = require("zod");
const primitives_1 = require("./primitives");
/**
 * Input schemas for the messages domain, shared by the apps and the API.
 *
 * Nothing here is trusted as identity — the server derives who is talking from
 * the verified token and which job the message is posted to
 * (CLAUDE.md "Security"). The body holds only content and the thread anchor.
 */
exports.messageContentSchema = zod_1.z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(500, 'Keep the message under 500 characters.');
/** Posts one message to a job conversation. */
exports.sendMessageSchema = zod_1.z.object({
    jobId: primitives_1.idSchema,
    content: exports.messageContentSchema,
});
/**
 * Acks every still-unacknowledged message from the other party of a job as
 * either delivered or read. Delivered and read share this body; only the route
 * differs by what timestamp it writes.
 */
exports.markMessagesReceivedSchema = zod_1.z.object({
    jobId: primitives_1.idSchema,
});
/**
 * Lists a job conversation, oldest first in chat reading order. `before` anchors
 * an older page (the oldest message id currently on screen); null loads the
 * newest page to fill the viewport.
 */
exports.messageListQuerySchema = zod_1.z.object({
    jobId: primitives_1.idSchema,
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    before: primitives_1.idSchema.optional(),
});
//# sourceMappingURL=message.js.map