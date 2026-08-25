import type { PrismaClient } from '../database/prisma';
import { logger } from '../common/logger';
import { createAuthService } from './auth.service';
import type { VerifiedToken } from './token';

function fakePrisma() {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const update = jest.fn();
  return {
    calls: { findUnique, upsert, update },
    client: { profile: { findUnique, upsert, update } } as unknown as PrismaClient,
  };
}

const token: VerifiedToken = {
  userId: '11111111-2222-3333-4444-555555555555',
  phone: '+919876543210',
  email: null,
};

const service = (prisma: PrismaClient) => createAuthService({ prisma, signupDefaultRole: 'PRO' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('syncUser', () => {
  it('returns an existing user untouched when nothing changed', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({
      id: token.userId,
      role: 'PRO',
      phone: token.phone,
      email: null,
    });

    const user = await service(prisma.client).syncUser(token);

    expect(user.id).toBe(token.userId);
    // No pointless write on the hot path.
    expect(prisma.calls.update).not.toHaveBeenCalled();
    expect(prisma.calls.upsert).not.toHaveBeenCalled();
  });

  it('provisions a new user with the configured default role', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ id: token.userId, role: 'PRO' });

    await service(prisma.client).syncUser(token);

    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      id: token.userId,
      role: 'PRO',
      phone: '+919876543210',
    });
  });

  it('provisions a customer when appType is "customer"', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ id: token.userId, role: 'CUSTOMER' });

    await service(prisma.client).syncUser(token, 'customer');

    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      id: token.userId,
      role: 'CUSTOMER',
    });
  });

  it('ignores an invalid appType and falls back to the default role', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ id: token.userId, role: 'PRO' });

    await service(prisma.client).syncUser(token, 'hacker');

    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.create.role).toBe('PRO');
  });

  it('never changes the role of an existing user even if appType is sent', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({
      id: token.userId,
      role: 'CUSTOMER',
      phone: token.phone,
      email: null,
    });

    const user = await service(prisma.client).syncUser(token, 'pro');

    // Existing user keeps their role; appType is only for provisioning.
    expect(user.role).toBe('CUSTOMER');
    expect(prisma.calls.upsert).not.toHaveBeenCalled();
  });

  it('uses the auth user id as the primary key', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ id: token.userId, role: 'PRO' });

    await service(prisma.client).syncUser(token);

    // Sharing the key with auth.users is what the FK and any future RLS
    // policy depend on.
    expect(prisma.calls.upsert.mock.calls[0][0].where).toEqual({ id: token.userId });
  });

  it('never rewrites the role of an existing user', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ id: token.userId, role: 'ADMIN' });

    await service(prisma.client).syncUser(token);

    // Privilege escalation guard: re-syncing must not touch role.
    expect(prisma.calls.upsert.mock.calls[0][0].update).not.toHaveProperty('role');
  });

  it('refreshes mirrored contact details when the token disagrees', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({
      id: token.userId,
      role: 'PRO',
      phone: '+910000000000',
      email: null,
    });
    prisma.calls.update.mockResolvedValue({ id: token.userId, role: 'PRO', phone: token.phone });

    await service(prisma.client).syncUser(token);

    expect(prisma.calls.update).toHaveBeenCalledWith({
      where: { id: token.userId },
      data: { phone: token.phone, email: null },
    });
    // Still no role in the update path.
    expect(prisma.calls.update.mock.calls[0][0].data).not.toHaveProperty('role');
  });
});
