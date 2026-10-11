import { UserRole } from '@samona/types';
import { createMessagesService } from './messages.service';
import { REALTIME_EVENTS } from '../realtime/gateway';

/**
 * A job whose customer and pro are the SAME account — a single phone number
 * signed into both the Pro and Customer apps on two phones. Both sides then
 * carry the same Profile id, which is exactly the case that used to break chat
 * (messages echoed to the sender, and never shown to the other surface).
 */
function sameUserJob() {
  return {
    id: 'job-1',
    proId: 'pro-1',
    pro: { userId: 'user-1', displayName: 'Pro One', profile: { phone: '+910000000001' } },
    customer: { userId: 'user-1', displayName: 'Cust One', profile: { phone: '+910000000001' } },
  };
}

function build({
  job = sameUserJob(),
  createdMessage = {
    id: 'msg-1',
    jobId: 'job-1',
    senderId: 'user-1',
    senderRole: UserRole.PRO,
    content: 'Hi',
    sentAt: new Date('2026-09-08T00:00:00Z'),
    deliveredAt: null,
    readAt: null,
  },
  unreadCount = 2,
}: {
  job?: unknown;
  createdMessage?: unknown;
  unreadCount?: number;
} = {}) {
  const prisma = {
    job: { findUnique: jest.fn().mockResolvedValue(job) },
    message: {
      create: jest.fn().mockResolvedValue(createdMessage),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ id: 'msg-1' }]),
      count: jest.fn().mockResolvedValue(unreadCount),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };

  const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };

  const sendChatPush = jest.fn().mockResolvedValue(undefined);

  const service = createMessagesService({
    prisma: prisma as never,
    realtime: realtime as never,
    sendChatPush,
  });

  return { service, prisma, realtime, sendChatPush };
}

describe('createMessagesService.send', () => {
  it('stores the PRO role and addresses the customer side when the pro surface sends, even though both sides are one user', async () => {
    const { service, prisma, realtime, sendChatPush } = build({
      createdMessage: {
        id: 'msg-1',
        jobId: 'job-1',
        senderId: 'user-1',
        senderRole: UserRole.PRO,
        content: 'On my way',
        sentAt: new Date('2026-09-08T00:00:00Z'),
        deliveredAt: null,
        readAt: null,
      },
    });

    const result = await service.send('user-1', { jobId: 'job-1', content: 'On my way' }, 'pro');

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { jobId: 'job-1', senderId: 'user-1', senderRole: UserRole.PRO, content: 'On my way' },
    });

    // The "other party" is the same Profile id — the emit hits that user's room
    // and both surfaces filter by role; the DTO must say which role authored it.
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.MESSAGE_NEW,
      expect.objectContaining({ senderId: 'user-1', senderRole: UserRole.PRO }),
    );

    // A pro message is unread for the customer surface, so the recipient's
    // badge gets the authoritative recount of PRO-authored messages.
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: { jobId: 'job-1', senderRole: UserRole.PRO, readAt: null },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.MESSAGE_UNREAD,
      expect.objectContaining({ jobId: 'job-1', recipientRole: UserRole.CUSTOMER, unreadCount: 2 }),
    );

    // A pro message goes to the customer side — the customer's own phone.
    expect(sendChatPush).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recipientIsCustomer: true,
        senderName: 'Pro One',
      }),
    );

    expect(result.senderRole).toBe(UserRole.PRO);
  });

  it('stores the CUSTOMER role and addresses the pro side when the customer surface sends', async () => {
    const { service, prisma, realtime, sendChatPush } = build({
      createdMessage: {
        id: 'msg-2',
        jobId: 'job-1',
        senderId: 'user-1',
        senderRole: UserRole.CUSTOMER,
        content: 'Can you fix it today?',
        sentAt: new Date('2026-09-08T00:00:00Z'),
        deliveredAt: null,
        readAt: null,
      },
    });

    await service.send('user-1', { jobId: 'job-1', content: 'Can you fix it today?' }, 'customer');

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        senderId: 'user-1',
        senderRole: UserRole.CUSTOMER,
        content: 'Can you fix it today?',
      },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.MESSAGE_NEW,
      expect.objectContaining({ senderRole: UserRole.CUSTOMER }),
    );
    expect(sendChatPush).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recipientIsCustomer: false,
        senderName: 'Cust One',
      }),
    );
  });

  it('rejects a surface that does not own its side of the job', async () => {
    const { service } = build();
    // Another account claims the pro surface of a job whose pro is user-1.
    await expect(
      service.send('intruder', { jobId: 'job-1', content: 'hi' }, 'pro'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('persists a message to a deleted customer but nudges nobody', async () => {
    const deletedCustomerJob = {
      id: 'job-1',
      proId: 'pro-1',
      pro: { userId: 'pro-user', displayName: 'Pro One', profile: { phone: '+910000000001' } },
      // The customer surface was deleted: its tombstone is unlinked (userId null).
      customer: { userId: null, displayName: null, profile: null },
    };
    const { service, prisma, realtime, sendChatPush } = build({
      job: deletedCustomerJob,
      createdMessage: {
        id: 'msg-1',
        jobId: 'job-1',
        senderId: 'pro-user',
        senderRole: UserRole.PRO,
        content: 'On my way',
        sentAt: new Date('2026-09-08T00:00:00Z'),
        deliveredAt: null,
        readAt: null,
      },
    });

    const result = await service.send('pro-user', { jobId: 'job-1', content: 'On my way' }, 'pro');

    // REST stays the source of truth: the row is written.
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { jobId: 'job-1', senderId: 'pro-user', senderRole: UserRole.PRO, content: 'On my way' },
    });
    // There is no reachable recipient, so nothing is emitted, counted or pushed
    // — a re-registered surface must never receive this old thread.
    expect(realtime.emitToUser).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
    expect(sendChatPush).not.toHaveBeenCalled();
    expect(prisma.message.count).not.toHaveBeenCalled();
    expect(result.senderRole).toBe(UserRole.PRO);
  });
});

describe('createMessagesService.listForParty', () => {
  it('anchors an older page on the cursor message’s (sentAt, id), never on id alone', async () => {
    const { service, prisma } = build();
    const anchorSentAt = new Date('2026-09-08T00:00:05Z');
    (prisma.message.findFirst as jest.Mock).mockResolvedValue({
      id: 'msg-anchor',
      sentAt: anchorSentAt,
    });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'msg-older',
        jobId: 'job-1',
        senderId: 'user-1',
        senderRole: UserRole.PRO,
        content: 'Earlier',
        sentAt: new Date('2026-09-08T00:00:01Z'),
        deliveredAt: null,
        readAt: null,
      },
    ]);

    const page = await service.listForParty(
      'user-1',
      { jobId: 'job-1', limit: 50, before: 'msg-anchor' },
      'customer',
    );

    // The anchor is resolved within the job, so a foreign id cannot shift it.
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'msg-anchor', jobId: 'job-1' },
      select: { id: true, sentAt: true },
    });
    // The window is `< (sentAt, id)`, a total order matching reading order.
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: {
        jobId: 'job-1',
        OR: [{ sentAt: { lt: anchorSentAt } }, { sentAt: anchorSentAt, id: { lt: 'msg-anchor' } }],
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    // Reversed to oldest-first; the oldest id becomes the next page's anchor.
    expect(page.messages.map((m) => m.id)).toEqual(['msg-older']);
    expect(page.nextCursor).toBe('msg-older');
  });

  it('loads the newest page, unwindowed, when `before` is omitted', async () => {
    const { service, prisma } = build();
    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

    const page = await service.listForParty('user-1', { jobId: 'job-1', limit: 50 }, 'customer');

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1' },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    expect(page).toEqual({ messages: [], nextCursor: null });
  });

  it('returns an empty page when the cursor is not a message in this job', async () => {
    const { service, prisma } = build();
    (prisma.message.findFirst as jest.Mock).mockResolvedValue(null);

    const page = await service.listForParty(
      'user-1',
      { jobId: 'job-1', limit: 50, before: 'ff000000-0000-4000-8000-000000000000' },
      'customer',
    );

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(page).toEqual({ messages: [], nextCursor: null });
  });
});

describe('createMessagesService.markDelivered', () => {
  it('acks only the counterpart’s role when one user owns both sides', async () => {
    const { service, prisma, realtime } = build();

    await service.markDelivered('user-1', 'job-1', 'pro');

    // The pro acking must touch customer-side messages, not their own.
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        jobId: 'job-1',
        senderId: 'user-1',
        senderRole: UserRole.CUSTOMER,
        deliveredAt: null,
      },
      data: { deliveredAt: expect.any(Date) },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.MESSAGE_DELIVERED,
      expect.objectContaining({ senderRole: UserRole.CUSTOMER }),
    );
  });
});

describe('createMessagesService.markRead', () => {
  it('recounts the reader’s badge after marking the counterpart’s messages read', async () => {
    const { service, prisma, realtime } = build({ unreadCount: 0 });

    await service.markRead('user-1', 'job-1', 'pro');

    // Reading implies a recount, and the caller’s own surface gets it — even
    // though the same account owns both sides.
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: { jobId: 'job-1', senderRole: UserRole.CUSTOMER, readAt: null },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'user-1',
      REALTIME_EVENTS.MESSAGE_UNREAD,
      expect.objectContaining({ jobId: 'job-1', recipientRole: UserRole.PRO, unreadCount: 0 }),
    );
  });
});

describe('createMessagesService.listUnreadCounts', () => {
  it('counts PRO-authored unread messages the customer side has not read', async () => {
    const { service, prisma } = build();
    (prisma.message.groupBy as jest.Mock).mockResolvedValue([
      { jobId: 'job-1', _count: { _all: 3 } },
      { jobId: 'job-2', _count: { _all: 1 } },
    ]);

    const result = await service.listUnreadCounts('cust-1', 'customer');

    expect(prisma.message.groupBy).toHaveBeenCalledWith({
      by: ['jobId'],
      where: {
        senderRole: UserRole.PRO,
        readAt: null,
        job: { customer: { userId: 'cust-1' } },
      },
      _count: { _all: true },
    });
    expect(result.items).toEqual([
      { jobId: 'job-1', unreadCount: 3 },
      { jobId: 'job-2', unreadCount: 1 },
    ]);
  });

  it('counts CUSTOMER-authored unread messages the pro side has not read', async () => {
    const { service, prisma } = build();
    (prisma.message.groupBy as jest.Mock).mockResolvedValue([
      { jobId: 'job-2', _count: { _all: 7 } },
    ]);

    const result = await service.listUnreadCounts('pro-1', 'pro');

    expect(prisma.message.groupBy).toHaveBeenCalledWith({
      by: ['jobId'],
      where: {
        senderRole: UserRole.CUSTOMER,
        readAt: null,
        job: { pro: { userId: 'pro-1' } },
      },
      _count: { _all: true },
    });
    expect(result.items).toEqual([{ jobId: 'job-2', unreadCount: 7 }]);
  });

  it('returns nothing when the surface is unknown', async () => {
    const { service } = build();
    await expect(service.listUnreadCounts('user-1', null)).resolves.toEqual({ items: [] });
  });
});
