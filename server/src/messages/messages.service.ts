import {
  type ChatMessage,
  isChatClosed,
  type JobStatus,
  type MessagePage,
  type MessageReceiptUpdate,
  type MessageUnreadSummary,
  type MessageUnreadUpdate,
  UserRole,
} from '@samona/types';
import { type MessageListQuery, type SendMessageInput } from '@samona/validation';
import type { AppType } from '@samona/config';
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
 * and acknowledge the other side's messages as delivered or read.
 *
 * Who the caller is comes from the verified token; *which side of the job* they
 * act as comes from the surface they are on. The two cannot be told apart by id
 * alone, because one account can be both the customer and the pro of the same
 * job (a single phone number signing into both apps). So the actor's role is a
 * consequence of their `appType` (`X-App-Type`), always checked against the
 * job's own ownership (CLAUDE.md "Security") — never a free claim.
 *
 * Delivery has two halves (CLAUDE.md "Realtime"):
 *  - REST is the source of truth. A send persists the `Message` row and returns
 *    it; receipts persist `deliveredAt`/`readAt`.
 *  - Socket.IO nudges the other party live (`message:new`) and tells a sender
 *    their messages were delivered/read (`message:delivered` / `message:read`).
 *
 * Every realtime payload carries `senderRole`, so when one person owns both
 * sides (two sockets under one `userId`) each surface can keep "mine" and
 * "theirs" apart. A chat push (FCM/Expo) is handed to the notifications domain
 * via the injected `sendChatPush` dependency, addressed to the recipient's role
 * so it rings the device of the side being talked to.
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
  senderRole: UserRole;
  content: string;
  sentAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}): ChatMessage {
  return {
    id: row.id,
    jobId: row.jobId,
    senderId: row.senderId,
    senderRole: row.senderRole,
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
  /** The job's current status — what the conversation is still open for. */
  status: JobStatus;
  customer: { userId: string; displayName: string | null; phone: string | null };
  pro: { userId: string; displayName: string | null; phone: string | null };
};

export function createMessagesService(deps: MessagesServiceDeps) {
  const { prisma, realtime, sendChatPush } = deps;

  /**
   * Resolves the two parties of an accepted job by the caller's Profile id and
   * the surface they are on.
   *
   * A 404 hides a job that isn't the caller's; chat is only possible once the
   * job is assigned (a pro accepted it), otherwise there is nobody to talk to.
   */
  async function resolveThread(
    actorProfileId: string,
    jobId: string,
    appType: AppType | null,
  ): Promise<ResolvedThread> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        status: true,
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

    const customerUserId = job.customer.userId;
    const proUserId = job.pro.userId;

    // The surface picks the side the caller acts as. This is the only way to
    // tell the sides apart when one account owns both (same userId on both
    // sides): id comparison alone would match both. Authorisation still holds —
    // a surface may only act as the side it owns on this job.
    let actorIsCustomer: boolean;
    if (appType === 'pro') {
      if (proUserId !== actorProfileId) {
        throw forbidden('You are not part of this conversation.');
      }
      actorIsCustomer = false;
    } else if (appType === 'customer') {
      if (customerUserId !== actorProfileId) {
        throw forbidden('You are not part of this conversation.');
      }
      actorIsCustomer = true;
    } else if (customerUserId === actorProfileId) {
      // Unknown surface (e.g. a future admin client): fall back to id matching,
      // customer side winning a tie, mirroring the pre-appType behaviour.
      actorIsCustomer = true;
    } else if (proUserId === actorProfileId) {
      actorIsCustomer = false;
    } else {
      throw forbidden('You are not part of this conversation.');
    }

    return {
      thisProfileId: actorProfileId,
      otherProfileId: actorIsCustomer ? proUserId : customerUserId,
      actorIsCustomer,
      status: job.status,
      customer: {
        userId: customerUserId,
        displayName: job.customer.displayName,
        phone: job.customer.profile.phone,
      },
      pro: {
        userId: proUserId,
        displayName: job.pro.displayName,
        phone: job.pro.profile.phone,
      },
    };
  }

  /** The other party in a thread the actor is a party of. */
  async function otherParty(
    actorProfileId: string,
    jobId: string,
    appType: AppType | null,
  ): Promise<{ userId: string; displayName: string | null; phone: string | null }> {
    const thread = await resolveThread(actorProfileId, jobId, appType);
    return thread.actorIsCustomer ? thread.pro : thread.customer;
  }

  /** How many of one side's messages in a job are still unread. */
  async function countUnread(jobId: string, senderRole: UserRole): Promise<number> {
    return prisma.message.count({
      where: { jobId, senderRole, readAt: null },
    });
  }

  /**
   * The caller's unread counts across every job thread they are a party of,
   * as seen from the surface they are on. Nonzero entries only — the UI only
   * renders a badge when there is something to read.
   */
  async function listUnreadCounts(
    actorProfileId: string,
    appType: AppType | null,
  ): Promise<MessageUnreadSummary> {
    // The surface decides which side's inbox to tally; without one there is no
    // reliable way to pick (a single account can own both sides of a job).
    const otherSenderRole =
      appType === 'customer' ? UserRole.PRO : appType === 'pro' ? UserRole.CUSTOMER : null;
    if (!otherSenderRole) return { items: [] };

    const callerSide =
      appType === 'customer'
        ? { job: { customer: { userId: actorProfileId } } }
        : { job: { pro: { userId: actorProfileId } } };

    const rows = await prisma.message.groupBy({
      by: ['jobId'],
      where: { senderRole: otherSenderRole, readAt: null, ...callerSide },
      _count: { _all: true },
    });

    return {
      items: rows
        .filter((row) => row._count._all > 0)
        .map((row) => ({ jobId: row.jobId, unreadCount: row._count._all })),
    };
  }

  /** Nudges the recipient's surfaces with the job's current unread count. */
  function emitUnread(
    recipientProfileId: string,
    recipientRole: UserRole,
    jobId: string,
    unreadCount: number,
  ): void {
    const update: MessageUnreadUpdate = { jobId, unreadCount, recipientRole };
    realtime.emitToUser(recipientProfileId, REALTIME_EVENTS.MESSAGE_UNREAD, update);
  }

  /**
   * The job's thread, oldest first in chat reading order.
   *
   * `before` anchors a page of older messages: pass the oldest message id on
   * screen to load the history just before it; omit it to load the newest page,
   * which fills a fresh conversation from the bottom.
   */
  async function listForParty(
    actorProfileId: string,
    query: MessageListQuery,
    appType: AppType | null,
  ): Promise<MessagePage> {
    const { jobId, before, limit } = query;
    await resolveThread(actorProfileId, jobId, appType);

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
   * the body. The message is stamped with the side the caller acts as
   * (`senderRole`) and the other party is nudged over the socket and (when
   * their device holds a push token) alerted. The persisted DTO is returned for
   * optimistic reconciliation on the sender's side.
   *
   * A closed job (PAID / CANCELLED / EXPIRED) rejects new messages — history
   * stays readable, the conversation is just frozen.
   */
  async function send(
    actorProfileId: string,
    input: SendMessageInput,
    appType: AppType | null,
  ): Promise<ChatMessage> {
    const thread = await resolveThread(actorProfileId, input.jobId, appType);
    if (isChatClosed(thread.status)) {
      throw badRequest('This conversation is closed; you can no longer send messages.');
    }
    const senderRole: UserRole = thread.actorIsCustomer ? UserRole.CUSTOMER : UserRole.PRO;

    const created = await prisma.message.create({
      data: {
        jobId: input.jobId,
        senderId: actorProfileId,
        senderRole,
        content: input.content,
      },
    });
    const dto = toDto(created as never);

    // `otherProfileId` may equal the sender's own id when one account is both
    // parties: both their sockets share the `user:<id>` room, so this single
    // emit reaches the other surface (which filters by `senderRole`) without
    // touching the sender's own app.
    realtime.emitToUser(thread.otherProfileId, REALTIME_EVENTS.MESSAGE_NEW, dto);

    // The recipient's badge moves too. Re-count from the store so the value is
    // authoritative even when a burst of messages races ahead of the socket.
    // The message just sent is "theirs", so it counts under the actor's role
    // and the badge belongs to the recipient's surface.
    const recipientRole: UserRole = thread.actorIsCustomer ? UserRole.PRO : UserRole.CUSTOMER;
    emitUnread(
      thread.otherProfileId,
      recipientRole,
      input.jobId,
      await countUnread(input.jobId, senderRole),
    );

    const senderName = thread.actorIsCustomer
      ? thread.customer.displayName
      : thread.pro.displayName;
    await sendChatPush({
      userId: thread.otherProfileId,
      recipientIsCustomer: !thread.actorIsCustomer,
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
  async function markDelivered(
    actorProfileId: string,
    jobId: string,
    appType: AppType | null,
  ): Promise<void> {
    const thread = await resolveThread(actorProfileId, jobId, appType);
    const otherSenderRole: UserRole = thread.actorIsCustomer ? UserRole.PRO : UserRole.CUSTOMER;

    const touched = await prisma.message.updateMany({
      where: {
        jobId,
        senderId: thread.otherProfileId,
        senderRole: otherSenderRole,
        deliveredAt: null,
      },
      data: { deliveredAt: new Date() },
    });
    if (touched.count === 0) return;

    const ids = await prisma.message.findMany({
      where: {
        jobId,
        senderId: thread.otherProfileId,
        senderRole: otherSenderRole,
        deliveredAt: { not: null },
      },
      select: { id: true },
    });
    emitReceipt(thread, REALTIME_EVENTS.MESSAGE_DELIVERED, {
      jobId,
      messageIds: ids.map((m) => m.id),
      senderRole: otherSenderRole,
    });
  }

  /**
   * Marks the other party's messages in a job as read (double-blue tick).
   * Reading implies delivered, so any delivery gap is filled too.
   */
  async function markRead(
    actorProfileId: string,
    jobId: string,
    appType: AppType | null,
  ): Promise<void> {
    const thread = await resolveThread(actorProfileId, jobId, appType);
    const otherSenderRole: UserRole = thread.actorIsCustomer ? UserRole.PRO : UserRole.CUSTOMER;

    const touched = await prisma.message.updateMany({
      where: {
        jobId,
        senderId: thread.otherProfileId,
        senderRole: otherSenderRole,
        readAt: null,
      },
      data: { readAt: new Date(), deliveredAt: new Date() },
    });
    if (touched.count === 0) return;

    const ids = await prisma.message.findMany({
      where: {
        jobId,
        senderId: thread.otherProfileId,
        senderRole: otherSenderRole,
        readAt: { not: null },
      },
      select: { id: true },
    });
    emitReceipt(thread, REALTIME_EVENTS.MESSAGE_READ, {
      jobId,
      messageIds: ids.map((m) => m.id),
      senderRole: otherSenderRole,
    });

    // The reader's own badge drops to whatever this job still has unread.
    const readerRole: UserRole = thread.actorIsCustomer ? UserRole.CUSTOMER : UserRole.PRO;
    emitUnread(thread.thisProfileId, readerRole, jobId, await countUnread(jobId, otherSenderRole));
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

  return { listForParty, listUnreadCounts, send, markDelivered, markRead, otherParty };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
