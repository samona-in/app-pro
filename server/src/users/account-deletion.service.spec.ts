import { createHash } from 'node:crypto';
import { AccountDeletionScope, AccountDeletionStatus, AccountDeletionStep } from '@samona/types';
import { createAccountDeletionService } from './account-deletion.service';
import type { AppConfig } from '../config';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { RealtimeService } from '../realtime/gateway';

/** Same SHA-256 scheme the service uses to identify a token by digest. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface StoredPro {
  id: string;
  userId: string;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
  isOnline: boolean;
  displayName: string | null;
}

interface StoredAccount {
  profileId: string;
  scope: AccountDeletionScope;
  status: AccountDeletionStatus;
  step: AccountDeletionStep | null;
  attempts: number;
  lastError: string | null;
  authTokenHash: string | null;
  authTokenExpiresAt: Date | null;
  authTokenConsumedAt: Date | null;
}

/** A small in-memory stand-in for the Prisma surface the service touches. */
function fakePrisma(initial: {
  pros?: Partial<StoredPro>[];
  customers?: string[];
  deletions?: Partial<StoredAccount>[];
  blockingJobs?: number;
}) {
  const pros: StoredPro[] = (initial.pros ?? [{ id: 'pro-1', userId: 'user-1' }]).map((p) => ({
    id: 'pro-1',
    userId: 'user-1',
    deletedAt: null,
    deletionRequestedAt: null,
    isOnline: true,
    displayName: 'Asha',
    ...p,
  }));
  const customers = new Set(initial.customers ?? []);
  const deletions: StoredAccount[] = (initial.deletions ?? []).map((d) => ({
    profileId: 'user-1',
    scope: AccountDeletionScope.FULL_ACCOUNT,
    status: AccountDeletionStatus.AUTHORIZED,
    step: null,
    attempts: 0,
    lastError: null,
    authTokenHash: null,
    authTokenExpiresAt: null,
    authTokenConsumedAt: null,
    ...d,
  }));
  const profile = {
    id: 'user-1',
    deletedAt: null,
    phone: '+919876543210',
    email: null,
    fullName: 'Asha Kumar',
    isActive: true,
    isAdmin: false,
    createdAt: new Date(),
  };

  const updates: string[] = [];

  // Annotating the container object breaks the object-literal circularity
  // (the transaction passthrough hands the container itself to the callback);
  // every access is through the typed cast at the return.
  const prisma: Record<string, unknown> = {
    profile: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== profile.id) return null;
        updates.push('profile.findUnique');
        return {
          ...profile,
          proProfile:
            pros.find((p) => p.userId === profile.id) ??
            ({ deletedAt: null, deletionRequestedAt: null } as StoredPro),
          customerProfile: customers.has(profile.id) ? { id: 'customer-1' } : null,
          accountDeletion:
            deletions.find((d) => d.profileId === profile.id && d.authTokenHash !== null) ??
            deletions.find((d) => d.profileId === profile.id) ??
            null,
        };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push('profile.update');
        Object.assign(profile, data);
        return { ...profile };
      }),
    },
    proProfile: {
      findMany: jest.fn(async () => {
        updates.push('proProfile.findMany');
        return pros;
      }),
      findUnique: jest.fn(async ({ where }: { where: { userId: string; id?: string } }) => {
        updates.push('proProfile.findUnique');
        const pro = pros.find((p) => p.userId === where.userId || p.id === where.id);
        return pro ? { ...pro } : null;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push('proProfile.update');
          const pro = pros.find((p) => p.id === where.id) ?? pros[0]!;
          Object.assign(pro, data);
          return { ...pro };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          updates.push('proProfile.updateMany');
          const matches = pros.filter((p) => {
            if (where.userId !== undefined && p.userId !== where.userId) return false;
            if (where.id !== undefined && p.id !== where.id) return false;
            if (where.deletionRequestedAt === null && p.deletionRequestedAt !== null) return false;
            return true;
          });
          matches.forEach((p) => Object.assign(p, data));
          return { count: matches.length };
        },
      ),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    accountDeletion: {
      findUnique: jest.fn(async ({ where }: { where: { profileId: string } }) => {
        updates.push('accountDeletion.findUnique');
        return deletions.find((d) => d.profileId === where.profileId) ?? null;
      }),
      findMany: jest.fn(async () => {
        updates.push('accountDeletion.findMany');
        return deletions.map((d) => ({
          profileId: d.profileId,
          status: d.status,
          attempts: d.attempts,
        }));
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push('accountDeletion.create');
        const row = {
          profileId: 'user-1',
          step: null,
          attempts: 0,
          lastError: null,
          ...data,
        } as unknown as StoredAccount;
        deletions.push(row);
        return { ...row };
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { profileId: string };
          data: Record<string, unknown>;
        }) => {
          updates.push('accountDeletion.update');
          const row = deletions.find((d) => d.profileId === where.profileId);
          if (!row) {
            const created = { profileId: where.profileId, ...data } as unknown as StoredAccount;
            deletions.push(created);
            return { ...created };
          }
          const { increment } = (data.attempts ?? {}) as { increment?: number };
          if (typeof increment === 'number') row.attempts += increment;
          if ('attempts' in data && increment === undefined) row.attempts = data.attempts as number;
          const { attempts: _attempts, ...rest } = data;
          Object.assign(row, rest);
          return { ...row };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          updates.push('accountDeletion.updateMany');
          const matches = deletions.filter((d) => {
            if (where.profileId !== undefined && d.profileId !== where.profileId) return false;
            if (where.status !== undefined && d.status !== where.status) return false;
            if (where.authTokenHash !== undefined && d.authTokenHash !== where.authTokenHash)
              return false;
            if (where.authTokenConsumedAt === null && d.authTokenConsumedAt !== null) return false;
            if (where.authTokenExpiresAt) {
              const expiry = (where.authTokenExpiresAt as { gt?: Date }).gt;
              if (!d.authTokenExpiresAt || (expiry && d.authTokenExpiresAt <= expiry)) return false;
            }
            return true;
          });
          matches.forEach((d) => Object.assign(d, data));
          return { count: matches.length };
        },
      ),
    },
    job: {
      count: jest.fn(async () => {
        updates.push('job.count');
        return initial.blockingJobs ?? 0;
      }),
    },
    proService: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    proSkill: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    proDocument: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    jobDecline: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    jobOffer: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma as unknown)),
    __updates: updates,
    __pros: pros,
    __profile: profile,
    __deletions: deletions,
  };
  return prisma as unknown as PrismaClient & {
    __updates: string[];
    __pros: StoredPro[];
    __profile: typeof profile;
    __deletions: StoredAccount[];
  };
}

function config(): AppConfig {
  return {
    accountDeletionReauthWindowMs: 5 * 60_000,
    accountDeletionTokenTtlMs: 5 * 60_000,
    accountDeletionSweepMs: 30_000,
    accountDeletionMaxAttempts: 5,
  } as unknown as AppConfig;
}

const storage = {
  removeObjectPrefix: jest.fn().mockResolvedValue(undefined),
} as unknown as StorageService;

const realtime = {
  disconnectUser: jest.fn(),
} as unknown as RealtimeService;

function secondsFromNow(s: number): number {
  return Math.floor((Date.now() + s * 1000) / 1000);
}

describe('createAccountDeletionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issueAuthorization', () => {
    it('refuses without a fresh OTP in the amr claim', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const stale = { method: 'otp', timestamp: secondsFromNow(-60 * 60) };
      await expect(service.issueAuthorization('user-1', [stale])).rejects.toMatchObject({
        status: 403,
      });

      await expect(service.issueAuthorization('user-1', [])).rejects.toMatchObject({ status: 403 });
      await expect(
        service.issueAuthorization('user-1', [{ method: 'oauth', timestamp: secondsFromNow(-10) }]),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('mints a single-use authorization scoped to the pro surface only when both profiles exist', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { token, scope, expiresAt } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);

      expect(scope).toBe(AccountDeletionScope.PRO_PROFILE);
      expect(expiresAt).toEqual(expect.any(String));
      const row = prisma.__deletions[0]!;
      expect(row.authTokenHash).toBe(hashToken(token));
      expect(row.status).toBe(AccountDeletionStatus.AUTHORIZED);
      expect(row.authTokenConsumedAt).toBeNull();
    });

    it('mints a full-account authorization for a pro-only account', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { scope } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);

      expect(scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
    });

    it('does not mint twice while a prior token is still pending', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);
      await expect(
        service.issueAuthorization('user-1', [{ method: 'otp', timestamp: secondsFromNow(-30) }]),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('deleteAccount', () => {
    it('deletes only the pro surface when a customer profile exists, keeping the identity', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      const admin = { deleteUser: jest.fn() };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);
      const result = await service.deleteAccount('user-1', token);

      expect(result).toEqual({
        scope: AccountDeletionScope.PRO_PROFILE,
        deferredToActiveJobs: false,
      });
      // The identity row keeps its phone and stays active; the pro surface is gone.
      expect(prisma.__profile.phone).toBe('+919876543210');
      expect(prisma.__profile.deletedAt).toBeNull();
      expect(prisma.__pros[0]!.deletedAt).not.toBeNull();
      expect(prisma.__pros[0]!.displayName).toBeNull();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
      // A PRO_PROFILE deletion never touches the Supabase identity.
      expect(admin.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes the identity too for a full-account deletion', async () => {
      const prisma = fakePrisma({});
      const admin = { deleteUser: jest.fn().mockResolvedValue(undefined) };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);
      const result = await service.deleteAccount('user-1', token);

      expect(result.scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      expect(result.deferredToActiveJobs).toBe(false);
      expect(prisma.__profile.phone).toBeNull();
      expect(prisma.__profile.fullName).toBeNull();
      expect(prisma.__profile.isActive).toBe(false);
      expect(prisma.__profile.deletedAt).not.toBeNull();
      expect(admin.deleteUser).toHaveBeenCalledWith('user-1');
      expect(realtime.disconnectUser).toHaveBeenCalledWith('user-1', undefined);
      // The pro's S3 objects are purged as part of the flow.
      expect(storage.removeObjectPrefix).toHaveBeenCalled();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
    });

    it('rejects a bogus token as consumed/expired (410)', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });
      await expect(service.deleteAccount('user-1', 'not-a-real-token')).rejects.toMatchObject({
        status: 410,
      });
    });

    it('refuses a replay of an already-consumed token', async () => {
      const prisma = fakePrisma({});
      const admin = { deleteUser: jest.fn() };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);
      await service.deleteAccount('user-1', token);

      await expect(service.deleteAccount('user-1', token)).rejects.toMatchObject({ status: 410 });
    });

    it('defers finalization while blocking jobs remain', async () => {
      const prisma = fakePrisma({ blockingJobs: 2 });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { token, scope } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ]);
      const result = await service.deleteAccount('user-1', token);

      expect(result).toEqual({ scope, deferredToActiveJobs: true });
      // The pro is locked out immediately even though finalization waits.
      expect(prisma.__pros[0]!.isOnline).toBe(false);
      expect(prisma.__pros[0]!.deletionRequestedAt).not.toBeNull();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.AWAITING_ACTIVE_JOBS);
      expect(storage.removeObjectPrefix).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    it('finalizes a deferred deletion once the blocking jobs clear', async () => {
      const prisma = fakePrisma({
        deletions: [{ status: AccountDeletionStatus.AWAITING_ACTIVE_JOBS }],
        blockingJobs: 0,
      });
      const admin = { deleteUser: jest.fn() };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      await service.sweep();

      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
    });

    it('skips a deletion that already failed past the attempt ceiling', async () => {
      const prisma = fakePrisma({
        deletions: [
          { status: AccountDeletionStatus.FAILED, attempts: 5, step: AccountDeletionStep.FINALIZE },
        ],
      });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      await service.sweep();

      // Nothing advanced: no attempt bump, no disconnect, still FAILED.
      expect(realtime.disconnectUser).not.toHaveBeenCalled();
      expect(prisma.accountDeletion.update).not.toHaveBeenCalled();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.FAILED);
      expect(prisma.__deletions[0]!.attempts).toBe(5);
    });

    it('retries a failed deletion that is still under the ceiling', async () => {
      const prisma = fakePrisma({
        deletions: [{ status: AccountDeletionStatus.FAILED, attempts: 2 }],
      });
      const admin = { deleteUser: jest.fn() };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      await service.sweep();

      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
      expect(prisma.__deletions[0]!.attempts).toBe(3);
    });
  });

  describe('getDeletionStatus', () => {
    it('reports active jobs while they block finalization', async () => {
      const prisma = fakePrisma({ blockingJobs: 1 });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const status = await service.getDeletionStatus('user-1');

      expect(status.activeJobCount).toBe(1);
      expect(status.canAuthorize).toBe(true);
      expect(status.deleted).toBe(false);
    });

    it('reports a completed deletion as deleted', async () => {
      const prisma = fakePrisma({
        deletions: [{ status: AccountDeletionStatus.COMPLETED }],
        pros: [{ deletedAt: new Date(), deletionRequestedAt: new Date() }],
      });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const status = await service.getDeletionStatus('user-1');

      expect(status.deleted).toBe(true);
      expect(status.inProgress).toBe(false);
    });
  });
});
