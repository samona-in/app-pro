import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';

const getUser = jest.fn();

jest.mock('@clerk/express', () => ({
  createClerkClient: () => ({ users: { getUser } }),
}));

// Imported after the mock so the service picks up the stubbed client.
import { createAuthService } from './auth.service';

function fakePrisma() {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const updateMany = jest.fn();
  return {
    calls: { findUnique, upsert, updateMany },
    client: { user: { findUnique, upsert, updateMany } } as unknown as PrismaClient,
  };
}

const clerkUser = (over: Record<string, unknown> = {}) => ({
  id: 'user_abc',
  primaryPhoneNumberId: 'idn_1',
  phoneNumbers: [
    { id: 'idn_1', phoneNumber: '+919876543210', verification: { status: 'verified' } },
  ],
  primaryEmailAddress: null,
  firstName: 'Asha',
  lastName: 'Kumar',
  imageUrl: '',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('syncUser', () => {
  it('returns the existing user without calling Clerk', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({ id: 'u1', clerkUserId: 'user_abc', role: 'PRO' });

    const service = createAuthService({
      prisma: prisma.client,
      clerkSecretKey: 'sk_test',
      signupDefaultRole: 'PRO',
    });
    const user = await service.syncUser('user_abc');

    expect(user.id).toBe('u1');
    // The common path must not make a network call to Clerk.
    expect(getUser).not.toHaveBeenCalled();
  });

  it('provisions a new user with the configured default role', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue(clerkUser());
    prisma.calls.upsert.mockResolvedValue({ id: 'u2', clerkUserId: 'user_abc', role: 'PRO' });

    const service = createAuthService({
      prisma: prisma.client,
      clerkSecretKey: 'sk_test',
      signupDefaultRole: 'PRO',
    });
    await service.syncUser('user_abc');

    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      clerkUserId: 'user_abc',
      role: 'PRO',
      phone: '+919876543210',
      fullName: 'Asha Kumar',
    });
  });

  it('never changes the role of an existing user when re-syncing', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue(clerkUser());
    prisma.calls.upsert.mockResolvedValue({ id: 'u3', clerkUserId: 'user_abc', role: 'ADMIN' });

    const service = createAuthService({
      prisma: prisma.client,
      clerkSecretKey: 'sk_test',
      signupDefaultRole: 'PRO',
    });
    await service.syncUser('user_abc');

    // Privilege escalation guard: a re-sync must not rewrite role.
    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty('role');
  });

  it('ignores an unverified phone number', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue(
      clerkUser({
        phoneNumbers: [
          { id: 'idn_1', phoneNumber: '+910000000000', verification: { status: 'unverified' } },
        ],
      }),
    );
    prisma.calls.upsert.mockResolvedValue({ id: 'u4', clerkUserId: 'user_abc', role: 'PRO' });

    const service = createAuthService({
      prisma: prisma.client,
      clerkSecretKey: 'sk_test',
      signupDefaultRole: 'PRO',
    });
    await service.syncUser('user_abc');

    // An unverified number must never be stored as an identity.
    expect(prisma.calls.upsert.mock.calls[0][0].create.phone).toBeNull();
  });
});

describe('deactivateUser', () => {
  it('deactivates rather than deleting, to preserve financial history', async () => {
    const prisma = fakePrisma();
    prisma.calls.updateMany.mockResolvedValue({ count: 1 });

    const service = createAuthService({
      prisma: prisma.client,
      clerkSecretKey: 'sk_test',
      signupDefaultRole: 'PRO',
    });
    await service.deactivateUser('user_abc');

    expect(prisma.calls.updateMany).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_abc' },
      data: { isActive: false },
    });
  });
});
