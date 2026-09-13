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

/** A bare Profile row without the `role` column the old schema carried. */
const profileRow = {
  id: token.userId,
  isAdmin: false,
  phone: token.phone,
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

const service = (prisma: PrismaClient) => createAuthService({ prisma });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('syncUser', () => {
  it('returns an existing user untouched when nothing changed', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(profileRow);

    const user = await service(prisma.client).syncUser(token);

    expect(user.id).toBe(token.userId);
    // No pointless write on the hot path.
    expect(prisma.calls.update).not.toHaveBeenCalled();
    expect(prisma.calls.upsert).not.toHaveBeenCalled();
  });

  it('provisions a new plain user (isAdmin false, no stored role)', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue(profileRow);

    await service(prisma.client).syncUser(token);

    const args = prisma.calls.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      id: token.userId,
      phone: '+919876543210',
    });
    // No single stored role: the surface is chosen per request.
    expect(args.create).not.toHaveProperty('role');
  });

  it('resolves the surface from the X-App-Type header', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(profileRow);

    const customer = await service(prisma.client).syncUser(token, 'customer');
    const pro = await service(prisma.client).syncUser(token, 'pro');

    expect(customer.appType).toBe('customer');
    expect(pro.appType).toBe('pro');
  });

  it('leaves appType null for an invalid or missing header', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(profileRow);

    const user = await service(prisma.client).syncUser(token, 'hacker');

    expect(user.appType).toBeNull();
  });

  it('uses the auth user id as the primary key', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue(profileRow);

    await service(prisma.client).syncUser(token);

    // Sharing the key with auth.users is what the FK and any future RLS
    // policy depend on.
    expect(prisma.calls.upsert.mock.calls[0][0].where).toEqual({ id: token.userId });
  });

  it('never rewrites the admin flag of a provisioned identity', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(null);
    prisma.calls.upsert.mockResolvedValue({ ...profileRow, isAdmin: true });

    await service(prisma.client).syncUser(token);

    // Privilege escalation guard: re-syncing must not touch isAdmin.
    expect(prisma.calls.upsert.mock.calls[0][0].update).not.toHaveProperty('isAdmin');
  });

  it('keeps isAdmin from the database for an existing admin', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({ ...profileRow, isAdmin: true });

    const user = await service(prisma.client).syncUser(token);

    expect(user.isAdmin).toBe(true);
  });

  it('refreshes mirrored contact details when the token disagrees', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue({ ...profileRow, phone: '+910000000000' });
    prisma.calls.update.mockResolvedValue(profileRow);

    const user = await service(prisma.client).syncUser(token, 'pro');

    expect(prisma.calls.update).toHaveBeenCalledWith({
      where: { id: token.userId },
      data: { phone: token.phone, email: null },
    });
    // Still no role or admin in the update path.
    expect(prisma.calls.update.mock.calls[0][0].data).not.toHaveProperty('role');
    expect(prisma.calls.update.mock.calls[0][0].data).not.toHaveProperty('isAdmin');
    // The server-side surface is preserved even when contact details refresh.
    expect(user.appType).toBe('pro');
  });

  it('adopts the account that already owns the phone when the auth id is new', async () => {
    const prisma = fakePrisma();
    // Id lookup misses (fresh Supabase id), but the same verified phone is
    // already claimed by an account under an old id.
    prisma.calls.findUnique.mockResolvedValueOnce(null);
    prisma.calls.findUnique.mockResolvedValueOnce({ ...profileRow, id: 'aaaaaaaa-9999-8888-7777-666666666666' });
    prisma.calls.update.mockResolvedValue(profileRow);

    await service(prisma.client).syncUser(token);

    // Re-keying moves the existing account to the current identity so its
    // domain data (profile, jobs, earnings) follows the phone.
    expect(prisma.calls.update).toHaveBeenCalledWith({
      where: { id: 'aaaaaaaa-9999-8888-7777-666666666666' },
      data: { id: token.userId, phone: token.phone, email: null },
    });
    // No insert happens: the account is re-keyed, not duplicated.
    expect(prisma.calls.upsert).not.toHaveBeenCalled();
  });

  it('does not adopt when the id lookup succeeds', async () => {
    const prisma = fakePrisma();
    prisma.calls.findUnique.mockResolvedValue(profileRow);

    await service(prisma.client).syncUser(token);

    // The existing-user path must never re-key; the phone lookup is not even
    // reached because the identity already owns a local row.
    expect(prisma.calls.update).not.toHaveBeenCalled();
    expect(prisma.calls.upsert).not.toHaveBeenCalled();
  });
});
