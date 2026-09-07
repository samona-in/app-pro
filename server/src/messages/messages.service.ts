import { type ChatMessage, type MessagePage, type MessageReceiptUpdate } from '@samona/types';
import { type MessageListQuery, type SendMessageInput } from '@samona/validation';
import type { PrismaClient } from '../database/prisma';
import { badRequest, forbidden, notFound } from '../common/errors';
import type { RealtimeEvent, RealtimeService } from '../realtime/gateway';
import { REALTIME_EVENTS } from '../realtime/gateway';
import type { ChatPushSender } from '../notifications/notifications.service';

/**
 * Messages domain service.
 *
 * Messaging exists only between the two parties of a job that has been
 * accepted (a `proId` is set). Either party may read the thread, send into it,
 * and acknowledge the other side's messages as delivered or read. The server
 * derives who is talking from the verified token and the job's own ownership —
 * never from a client-supplied sender id (CLAUDE.md "Security").
 *
 * Delivery has two halves (CLAUDE.md "Realtime"):
 *  - REST is the source of truth. A send persists the `Message` row and returns
 *    it; receipts persist `deliveredAt`/`readAt`.
 *  - Socket.IO nudges the other party live (`message:new`) and tells a sender
 *    their messages were delivered/read (`message:delivered` / `message:read`).
 *
 * A chat push (FCM/Expo) is handed to the notifications domain via the injected
 * `sendChatPush` dependency so the recipient still gets an alert when the
 * thread isn't open. The WhatsApp-style status icons on the sender's side are
 * derived from the persisted receipt timestamps.
 */

export interface MessagesServiceDeps {
  prisma: PrismaClient;
  realtime: RealtimeService;
  /** Delivers a chat push to a party; provided by the notifications domain. */
  sendChatPush: ChatPushSender;
}

function toDto(row: {
  id: string;
  jobId: string;
  senderId: string;
  content: string;
  sentAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}): ChatMessage {
  return {
    id: row.id,
    jobId: row.jobId,
    senderId: row.senderId,
    content: row.content,
    sentAt: row.sentAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

/** A resolved thread plus the caller's role within it. */
type ResolvedThread = {
  /** Actor's Profile id (equals `auth.users.id`). */
  thisProfileId: string;
  /** Other party's Profile id — the recipient of the actor's messages. */
  otherProfileId: string;
  /** Which side the actor is on, so headers/pushes address the right name. */
  actorIsCustomer: boolean;
  customer: { userId: string; displayName: string | null; phone: string | null };
  pro: { userId: string; displayName: string | null; phone: string | null };
};

export function createMessagesService(deps: MessagesServiceDeps) {
  const { prisma, realtime, sendChatPush } = deps;

  /**
   * Resolves the two parties of an accepted job by the caller's Profile id.
   *
   * A 404 hides a job that isn't the caller's; chat is only possible once the
   * job is assigned (a pro accepted it), otherwise there is nobody to talk to.
   */
  async function resolveThread(actorProfileId: string, jobId: string): Promise<ResolvedThread> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        proId: true,
        pro: {
          select: {
            userId: true,
            displayName: true,
            // Contact number lives on the shared identity row, not the profiles.
            profile: { select: { phone: true } },
          },
        },
        customer: {
          select: {
            userId: true,
            displayName: true,
            profile: { select: { phone: true } },
          },
        },
      },
    });
    if (!job) throw notFound('That conversation could not be found.');
    if (!job.pro) throw badRequest('You can start chatting once a professional accepts the job.');
    if (!job.customer) throw notFound('That conversation could not be found.');

    const actorIsCustomer = job.customer.userId === actorProfileId;
    const actorIsPro = job.pro.userId === actorProfileId;
    if (!actorIsCustomer && !actorIsPro) {
      throw forbidden('You are not part of this conversation.');
    }

    return {
      thisProfileId: actorProfileId,
      otherProfileId: actorIsCustomer ? job.pro.userId : job.customer.userId,
      actorIsCustomer,
      customer: {
        userId: job.customer.userId,
        displayName: job.customer.displayName,
        phone: job.customer.profile.phone,
      },
      pro: {
        userId: job.pro.userId,
        displayName: job.pro.displayName,
        phone: job.pro.profile.phone,
      },
    };
  }

  /** The other party in a thread the actor is a party of. */
  async function otherParty(
    actorProfileId: string,
    jobId: string,
  ): Promise<{ userId: string; displayName: string | null; phone: string | null }> {
    const thread = await resolveThread(actorProfileId, jobId);
    return thread.actorIsCustomer ? thread.pro : thread.customer;
  }

  /**
   * The job's thread, oldest first in chat reading order.
   *
   * `before` anchors a page of older messages: pass the oldest message id on
   * screen to load the history just before it; omit it to load the newest page,
   * which fills a fresh conversation from the bottom.
   */
  async function listForParty(actorProfileId: string, query: MessageListQuery): Promise<MessagePage> {
    const { jobId, before, limit } = query;
    await resolveThread(actorProfileId, jobId);

    const page = await prisma.message.findMany({
      where: { jobId, ...(before ? { id: { lt: before } } : {}) },
      // Newest-first so an anchored older page is bounded by `limit` before it;
      // reversed to oldest-first for chat reading order, with the oldest id as
      // the next page's anchor.
      orderBy: { sentAt: 'desc' },
      take: Math.max(1, Math.min(limit ?? 50, 100)),
    });

    const messages = page
      .slice()
      .reverse()
      .map((row) => toDto(row as never));
    const oldest = messages[0];
    const nextCursor = oldest ? oldest.id : null;

    return { messages, nextCursor };
  }

  /**
   * Sends one message into a job thread.
   *
   * The caller must be a party; `senderId` comes from the verified token, never
   * the body. The other party is nudged over the socket and (when their device
   * holds a push token) alerted, and the persisted DTO is returned for
   * optimistic reconciliation on the sender's side.
   */
  async function send(actorProfileId: string, input: SendMessageInput): Promise<ChatMessage> {
    const thread = await resolveThread(actorProfileId, input.jobId);

    const created = await prisma.message.create({
      data: { jobId: input.jobId, senderId: actorProfileId, content: input.content },
    });
    const dto = toDto(created as never);

    realtime.emitToUser(thread.otherProfileId, REALTIME_EVENTS.MESSAGE_NEW, dto);

    const senderName = thread.actorIsCustomer
      ? thread.customer.displayName
      : thread.pro.displayName;
    await sendChatPush({
      userId: thread.otherProfileId,
      jobId: input.jobId,
      senderName: senderName ?? 'A conversation',
      message: dto,
    });

    return dto;
  }

  /**
   * Marks the other party's messages in a job as delivered (single→double grey
   * tick). Idempotent: already-delivered messages are untouched.
   */
  async function markDelivered(actorProfileId: string, jobId: string): Promise<void> {
    const thread = await resolveThread(actorProfileId, jobId);

    const touched = await prisma.message.updateMany({
      where: { jobId, senderId: thread.otherProfileId, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    if (touched.count === 0) return;

    const ids = await prisma.message.findMany({
      where: { jobId, senderId: thread.otherProfileId, deliveredAt: { not: null } },
      select: { id: true },
    });
    emitReceipt(thread, REALTIME_EVENTS.MESSAGE_DELIVERED, {
      jobId,
      messageIds: ids.map((m) => m.id),
    });
  }

  /**
   * Marks the other party's messages in a job as read (double-blue tick).
   * Reading implies delivered, so any delivery gap is filled too.
   */
  async function markRead(actorProfileId: string, jobId: string): Promise<void> {
    const thread = await resolveThread(actorProfileId, jobId);

    const touched = await prisma.message.updateMany({
      where: { jobId, senderId: thread.otherProfileId, readAt: null },
      data: { readAt: new Date(), deliveredAt: new Date() },
    });
    if (touched.count === 0) return;

    const ids = await prisma.message.findMany({
      where: { jobId, senderId: thread.otherProfileId, readAt: { not: null } },
      select: { id: true },
    });
    emitReceipt(thread, REALTIME_EVENTS.MESSAGE_READ, {
      jobId,
      messageIds: ids.map((m) => m.id),
    });
  }

  /** Sends the receipt update to both parties (the sender is one of them). */
  function emitReceipt(
    thread: ResolvedThread,
    event: RealtimeEvent,
    update: MessageReceiptUpdate,
  ): void {
    realtime.emitToUser(thread.customer.userId, event, update);
    realtime.emitToUser(thread.pro.userId, event, update);
  }

  return { listForParty, send, markDelivered, markRead, otherParty };
}

export type MessagesService = ReturnType<typeof createMessagesService>;