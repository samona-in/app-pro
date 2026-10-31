import { createHash } from 'node:crypto';
import { AccountDeletionScope, AccountDeletionStatus, AccountDeletionStep } from '@samona/types';
import { createAccountDeletionService } from './account-deletion.service';
import type { AppConfig } from '../config';
import type { PrismaClient } from '../database/prisma';
import type { StorageService } from '../files/storage.service';
import type { RealtimeService } from '../realtime/gateway';
import type { LegalHoldService } from '../retention/legal-holds.service';
import type { CleanupAuditService } from '../retention/cleanup-audit.service';

/** Same SHA-256 scheme the service uses to identify a token by digest. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface StoredPro {
  id: string;
  userId: string;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
  isOnline: boolean;
  displayName: string | null;
  selfiePhotoPath?: string | null;
  selfieCapturedAt?: Date | null;
}

interface StoredCustomer {
  id: string;
  userId: string | null;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
  displayName: string | null;
  avatarUrl: string | null;
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
  holdsCapturedAt: Date | null;
  profileHeld: boolean;
  heldDocumentPaths: string[];
  customerProfileId: string | null;
}

/** A small in-memory stand-in for the Prisma surface the service touches. */
function fakePrisma(initial: {
  pros?: Partial<StoredPro>[];
  customers?: string[];
  deletions?: Partial<StoredAccount>[];
  blockingJobs?: number;
  proDocuments?: { id: string; proProfileId: string; storagePath: string }[];
}) {
  const proDocuments = initial.proDocuments ?? [];
  const pros: StoredPro[] = (initial.pros ?? [{ id: 'pro-1', userId: 'user-1' }]).map((p) => ({
    id: 'pro-1',
    userId: 'user-1',
    deletedAt: null,
    deletionRequestedAt: null,
    isOnline: true,
    displayName: 'Asha',
    ...p,
  }));
  const customers: StoredCustomer[] = (initial.customers ?? []).map((userId) => ({
    id: `customer-${userId}`,
    userId,
    deletedAt: null,
    deletionRequestedAt: null,
    displayName: 'Asha',
    avatarUrl: 'customers/user-1/avatar-1.jpg',
  }));
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
    holdsCapturedAt: null,
    profileHeld: false,
    heldDocumentPaths: [],
    customerProfileId: null,
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
          proProfile: pros.find((p) => p.userId === profile.id) ?? null,
          customerProfile: customers.find((c) => c.userId === profile.id) ?? null,
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
    customerProfile: {
      findMany: jest.fn(async () => customers),
      findUnique: jest.fn(async ({ where }: { where: { userId: string; id?: string } }) => {
        updates.push('customerProfile.findUnique');
        const customer = customers.find(
          (c) => c.userId === where.userId || c.id === where.id,
        );
        return customer ? { ...customer } : null;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push('customerProfile.update');
          const customer = customers.find((c) => c.id === where.id);
          if (!customer) return null;
          Object.assign(customer, data);
          return { ...customer };
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
          updates.push('customerProfile.updateMany');
          const matches = customers.filter((c) => {
            if (where.userId !== undefined && c.userId !== where.userId) return false;
            if (where.id !== undefined && c.id !== where.id) return false;
            if (where.deletionRequestedAt === null && c.deletionRequestedAt !== null) return false;
            return true;
          });
          matches.forEach((c) => Object.assign(c, data));
          return { count: matches.length };
        },
      ),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    savedAddress: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    customerNotification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
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
    proDocument: {
      findMany: jest.fn(async () => proDocuments),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    jobDecline: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    jobOffer: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    proPushDevice: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    cleanupAuditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma as unknown)),
    __updates: updates,
    __pros: pros,
    __customers: customers,
    __profile: profile,
    __deletions: deletions,
  };
  return prisma as unknown as PrismaClient & {
    __updates: string[];
    __pros: StoredPro[];
    __customers: StoredCustomer[];
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

interface StoredObject {
  bucket: string;
  key: string;
}

/**
 * A stateful stand-in for the storage surface: objects can be seeded, listed
 * and deleted, so a test can assert exactly which keys survived a purge.
 */
function makeStorage(initial: StoredObject[] = []) {
  const objects: StoredObject[] = [...initial];
  const api = {
    selfiesBucket: 'pro-selfies',
    avatarsBucket: 'avatars',
    bannersBucket: null,
    documentsBucket: 'pro-documents',
    jobImagesBucket: 'job-images',
    listObjects: jest.fn(async (bucket: string, prefix: string) => ({
      objects: objects
        .filter((o) => o.bucket === bucket && o.key.startsWith(prefix))
        .map((o) => ({ key: o.key, size: 1, lastModified: new Date(0) })),
      nextToken: undefined,
    })),
    deleteObjects: jest.fn(async (bucket: string, keys: string[]) => {
      for (const key of keys) {
        const idx = objects.findIndex((o) => o.bucket === bucket && o.key === key);
        if (idx >= 0) objects.splice(idx, 1);
      }
    }),
    deleteObject: jest.fn(async (bucket: string, key: string) => {
      const idx = objects.findIndex((o) => o.bucket === bucket && o.key === key);
      if (idx >= 0) objects.splice(idx, 1);
    }),
    removeObjectPrefix: jest.fn().mockResolvedValue(undefined),
    keyFromAvatarUrl: jest.fn(() => null),
    __objects: objects,
    keys(bucket: string): string[] {
      return objects
        .filter((o) => o.bucket === bucket)
        .map((o) => o.key)
        .sort();
    },
  };
  return api as typeof api & StorageService;
}

const storage = makeStorage();

const realtime = {
  disconnectUser: jest.fn(),
} as unknown as RealtimeService;

function fakeLegalHolds(
  held: { documents?: string[]; profiles?: string[] } = {},
): LegalHoldService {
  const documents = new Set(held.documents ?? []);
  const profiles = new Set(held.profiles ?? []);
  return {
    hasActiveHold: jest.fn(
      async (_type: string, id: string) => documents.has(id) || profiles.has(id),
    ),
    hasAnyActiveHoldForProfile: jest.fn(async (id: string) => profiles.has(id)),
    listActiveHolderIds: jest.fn(async (types: string | readonly string[]) => {
      const list = Array.isArray(types) ? types : [types];
      return list.includes('DOCUMENT') ? [...documents] : [...profiles];
    }),
    createHold: jest.fn(),
    releaseHold: jest.fn(),
  } as unknown as LegalHoldService;
}

function fakeAudit(): CleanupAuditService {
  return { record: jest.fn(async () => ({})) } as unknown as CleanupAuditService;
}

function secondsFromNow(s: number): number {
  return Math.floor((Date.now() + s * 1000) / 1000);
}

describe('createAccountDeletionService', () => {
  beforeEach(() => {
    storage.__objects.length = 0;
    jest.clearAllMocks();
  });

  describe('issueAuthorization', () => {
    it('refuses without a fresh OTP in the amr claim', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const stale = { method: 'otp', timestamp: secondsFromNow(-60 * 60) };
      await expect(service.issueAuthorization('user-1', [stale], null)).rejects.toMatchObject({
        status: 403,
      });

      await expect(service.issueAuthorization('user-1', [], null)).rejects.toMatchObject({ status: 403 });
      await expect(
        service.issueAuthorization('user-1', [{ method: 'oauth', timestamp: secondsFromNow(-10) }], null),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('mints a single-use authorization scoped to the pro surface only when both profiles exist', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { token, scope, expiresAt } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);

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
      ], null);

      expect(scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
    });

    it('mints a customer-surface authorization when both profiles exist', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );

      expect(scope).toBe(AccountDeletionScope.CUSTOMER_PROFILE);
    });

    it('mints a full-account authorization for a customer-only account', async () => {
      const prisma = fakePrisma({ pros: [], customers: ['user-1'] });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );

      expect(scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
    });

    it('re-issues a completed pro-surface row as a full-account deletion (dual-role)', async () => {
      const prisma = fakePrisma({
        customers: ['user-1'],
        pros: [{ deletedAt: new Date(), deletionRequestedAt: new Date() }],
        deletions: [
          { status: AccountDeletionStatus.COMPLETED, scope: AccountDeletionScope.PRO_PROFILE },
        ],
      });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );

      expect(scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      const row = prisma.__deletions[0]!;
      expect(row.scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      expect(row.status).toBe(AccountDeletionStatus.AUTHORIZED);
      expect(row.authTokenConsumedAt).toBeNull();
    });

    it('re-issues the customer surface once it was re-created by re-registration', async () => {
      const prisma = fakePrisma({
        customers: ['user-1'],
        deletions: [
          { status: AccountDeletionStatus.COMPLETED, scope: AccountDeletionScope.CUSTOMER_PROFILE },
        ],
      });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );

      // A completed customer-surface row used to be terminal; now the freshly
      // re-registered surface is deletable again, so the row is reset.
      expect(scope).toBe(AccountDeletionScope.CUSTOMER_PROFILE);
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.AUTHORIZED);
      expect(prisma.__deletions[0]!.step).toBeNull();
      expect(prisma.__deletions[0]!.customerProfileId).toBeNull();
    });

    it('does not mint twice while a prior token is still pending', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);
      await expect(
        service.issueAuthorization('user-1', [{ method: 'otp', timestamp: secondsFromNow(-30) }], null),
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
      ], null);
      const result = await service.deleteAccount('user-1', token, null);

      expect(result).toEqual({
        scope: AccountDeletionScope.PRO_PROFILE,
        deferredToActiveJobs: false,
      });
      // The identity row keeps its phone and stays active; the pro surface is gone.
      expect(prisma.__profile.phone).toBe('+919876543210');
      expect(prisma.__profile.deletedAt).toBeNull();
      expect(prisma.__pros[0]!.deletedAt).not.toBeNull();
      expect(prisma.__pros[0]!.displayName).toBeNull();
      expect(prisma.proPushDevice.deleteMany).toHaveBeenCalledWith({ where: { proId: prisma.__pros[0]!.id } });
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
      // A PRO_PROFILE deletion never touches the Supabase identity.
      expect(admin.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes only the customer surface, keeping the identity and the pro profile', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      storage.__objects.push(
        { bucket: 'avatars', key: 'pros/user-1/avatar-1.jpg' },
        { bucket: 'avatars', key: 'customers/user-1/avatar-1.jpg' },
        { bucket: 'job-images', key: 'jobs/user-1/job.jpg' },
      );
      const admin = { deleteUser: jest.fn() };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      const { token, scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );
      expect(scope).toBe(AccountDeletionScope.CUSTOMER_PROFILE);
      const result = await service.deleteAccount('user-1', token, 'customer');

      expect(result).toEqual({
        scope: AccountDeletionScope.CUSTOMER_PROFILE,
        deferredToActiveJobs: false,
      });
      // The identity and the pro surface survive; only the customer is gone.
      expect(prisma.__profile.phone).toBe('+919876543210');
      expect(prisma.__profile.deletedAt).toBeNull();
      expect(prisma.__pros[0]!.deletedAt).toBeNull();
      const customer = prisma.__customers[0]!;
      expect(customer.deletedAt).not.toBeNull();
      expect(customer.displayName).toBeNull();
      // The tombstone is unlinked so the identity can re-register fresh; the row
      // (and its id) survives for the booking/review/chat record.
      expect(customer.userId).toBeNull();
      // The run froze which customer surface it deletes, for a retry to reuse.
      expect(prisma.__deletions[0]!.customerProfileId).toBe('customer-user-1');
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
      expect(admin.deleteUser).not.toHaveBeenCalled();
      // The customer avatar is purged; the pro's avatar and job photos survive.
      expect(storage.keys('avatars')).toEqual(['pros/user-1/avatar-1.jpg']);
      expect(storage.keys('job-images')).toEqual(['jobs/user-1/job.jpg']);
    });

    it('completes a dual-role account by deleting the identity after the pro surface', async () => {
      const prisma = fakePrisma({
        customers: ['user-1'],
        pros: [{ deletedAt: new Date(), deletionRequestedAt: new Date() }],
        deletions: [
          { status: AccountDeletionStatus.COMPLETED, scope: AccountDeletionScope.PRO_PROFILE },
        ],
      });
      const admin = { deleteUser: jest.fn().mockResolvedValue(undefined) };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
      });

      const { token, scope } = await service.issueAuthorization(
        'user-1',
        [{ method: 'otp', timestamp: secondsFromNow(-60) }],
        'customer',
      );
      expect(scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      const result = await service.deleteAccount('user-1', token, 'customer');

      expect(result.scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      expect(prisma.__profile.phone).toBeNull();
      expect(prisma.__profile.deletedAt).not.toBeNull();
      expect(prisma.__customers[0]!.deletedAt).not.toBeNull();
      expect(admin.deleteUser).toHaveBeenCalledWith('user-1');
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
    });

    it('deletes the identity too for a full-account deletion', async () => {
      const prisma = fakePrisma({});
      storage.__objects.push(
        { bucket: 'pro-selfies', key: 'pros/user-1/selfie.jpg' },
        { bucket: 'avatars', key: 'pros/user-1/avatar-1.jpg' },
        { bucket: 'pro-documents', key: 'pros/user-1/documents/id.pdf' },
        { bucket: 'job-images', key: 'jobs/customer-1/job.jpg' },
      );
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
      ], null);
      const result = await service.deleteAccount('user-1', token, null);

      expect(result.scope).toBe(AccountDeletionScope.FULL_ACCOUNT);
      expect(result.deferredToActiveJobs).toBe(false);
      expect(prisma.__profile.phone).toBeNull();
      expect(prisma.__profile.fullName).toBeNull();
      expect(prisma.__profile.isActive).toBe(false);
      expect(prisma.__profile.deletedAt).not.toBeNull();
      expect(admin.deleteUser).toHaveBeenCalledWith('user-1');
      expect(realtime.disconnectUser).toHaveBeenCalledWith('user-1', undefined);
      // The pro's S3 objects are purged; the customer's job image is not.
      expect(storage.keys('pro-selfies')).toEqual([]);
      expect(storage.keys('avatars')).toEqual([]);
      expect(storage.keys('pro-documents')).toEqual([]);
      expect(storage.keys('job-images')).toEqual(['jobs/customer-1/job.jpg']);
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
    });

    it('rejects a bogus token as consumed/expired (410)', async () => {
      const prisma = fakePrisma({});
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });
      await expect(service.deleteAccount('user-1', 'not-a-real-token', null)).rejects.toMatchObject({
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
      ], null);
      await service.deleteAccount('user-1', token, null);

      await expect(service.deleteAccount('user-1', token, null)).rejects.toMatchObject({ status: 410 });
    });

    it('defers finalization while blocking jobs remain', async () => {
      const prisma = fakePrisma({ blockingJobs: 2 });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const { token, scope } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);
      const result = await service.deleteAccount('user-1', token, null);

      expect(result).toEqual({ scope, deferredToActiveJobs: true });
      // The pro is locked out immediately even though finalization waits.
      expect(prisma.__pros[0]!.isOnline).toBe(false);
      expect(prisma.__pros[0]!.deletionRequestedAt).not.toBeNull();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.AWAITING_ACTIVE_JOBS);
      expect(storage.listObjects).not.toHaveBeenCalled();
      expect(prisma.__pros[0]!.deletedAt).toBeNull();
    });

    it('preserves a document under an active hold and purges everything else', async () => {
      const prisma = fakePrisma({
        proDocuments: [
          { id: 'doc-held', proProfileId: 'pro-1', storagePath: 'pros/user-1/documents/held.pdf' },
          { id: 'doc-free', proProfileId: 'pro-1', storagePath: 'pros/user-1/documents/free.pdf' },
        ],
      });
      storage.__objects.push(
        { bucket: 'pro-selfies', key: 'pros/user-1/selfie.jpg' },
        { bucket: 'avatars', key: 'pros/user-1/avatar-1.jpg' },
        { bucket: 'pro-documents', key: 'pros/user-1/documents/held.pdf' },
        { bucket: 'pro-documents', key: 'pros/user-1/documents/free.pdf' },
      );
      const legalHolds = fakeLegalHolds({ documents: ['doc-held'] });
      const audit = fakeAudit();
      const admin = { deleteUser: jest.fn().mockResolvedValue(undefined) };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
        legalHolds,
        audit,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);
      await service.deleteAccount('user-1', token, null);

      // Only the held document object survives; the selfie, avatar and the
      // unheld document are still purged.
      expect(storage.keys('pro-documents')).toEqual(['pros/user-1/documents/held.pdf']);
      expect(storage.keys('pro-selfies')).toEqual([]);
      expect(storage.keys('avatars')).toEqual([]);
      // The row naming the held object is kept as its durable reference.
      expect(prisma.proDocument.deleteMany).toHaveBeenCalledWith({
        where: {
          proProfileId: 'pro-1',
          storagePath: { notIn: ['pros/user-1/documents/held.pdf'] },
        },
      });
      // A document-level hold does not preserve the selfie reference.
      expect(prisma.__pros[0]!.selfiePhotoPath ?? null).toBeNull();
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('resolves legal holds once and reuses the frozen snapshot for the DB step', async () => {
      const prisma = fakePrisma({
        proDocuments: [
          { id: 'doc-held', proProfileId: 'pro-1', storagePath: 'pros/user-1/documents/held.pdf' },
        ],
      });
      storage.__objects.push({
        bucket: 'pro-documents',
        key: 'pros/user-1/documents/held.pdf',
      });
      const legalHolds = fakeLegalHolds({ documents: ['doc-held'] });
      const admin = { deleteUser: jest.fn().mockResolvedValue(undefined) };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
        legalHolds,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);
      await service.deleteAccount('user-1', token, null);

      // Consulted once, before deletion; PURGE_DB consumed the frozen snapshot
      // and never re-resolved it. Re-resolving is the TOCTOU this guards.
      expect(legalHolds.hasAnyActiveHoldForProfile).toHaveBeenCalledTimes(1);
      expect(legalHolds.listActiveHolderIds).toHaveBeenCalledTimes(1);
      // The decision is durable on the row, so a retry sees the same value.
      expect(prisma.__deletions[0]!.holdsCapturedAt).not.toBeNull();
      expect(prisma.__deletions[0]!.heldDocumentPaths).toEqual(['pros/user-1/documents/held.pdf']);
    });

    it('preserves every pro-owned object under a profile-level hold', async () => {
      const prisma = fakePrisma({
        pros: [{ selfiePhotoPath: 'pros/user-1/selfie.jpg', selfieCapturedAt: new Date() }],
        proDocuments: [
          { id: 'doc-1', proProfileId: 'pro-1', storagePath: 'pros/user-1/documents/id.pdf' },
        ],
      });
      storage.__objects.push(
        { bucket: 'pro-selfies', key: 'pros/user-1/selfie.jpg' },
        { bucket: 'avatars', key: 'pros/user-1/avatar-1.jpg' },
        { bucket: 'pro-documents', key: 'pros/user-1/documents/id.pdf' },
      );
      const legalHolds = fakeLegalHolds({ profiles: ['user-1'] });
      const audit = fakeAudit();
      const admin = { deleteUser: jest.fn().mockResolvedValue(undefined) };
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: admin,
        legalHolds,
        audit,
      });

      const { token } = await service.issueAuthorization('user-1', [
        { method: 'otp', timestamp: secondsFromNow(-60) },
      ], null);
      await service.deleteAccount('user-1', token, null);

      // Nothing under the held profile is removed, and the rows that name the
      // objects (selfie reference, documents) are kept.
      expect(storage.keys('pro-selfies')).toEqual(['pros/user-1/selfie.jpg']);
      expect(storage.keys('avatars')).toEqual(['pros/user-1/avatar-1.jpg']);
      expect(storage.keys('pro-documents')).toEqual(['pros/user-1/documents/id.pdf']);
      expect(prisma.proDocument.deleteMany).not.toHaveBeenCalled();
      expect(prisma.__pros[0]!.selfiePhotoPath).toBe('pros/user-1/selfie.jpg');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'HOLD_PRESERVED_S3' }),
      );
      // Deletion still completes; a hold preserves evidence, it does not stall.
      expect(prisma.__deletions[0]!.status).toBe(AccountDeletionStatus.COMPLETED);
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

    it('purges the frozen customer surface, never a re-registered one', async () => {
      const prisma = fakePrisma({
        customers: ['user-1'],
        deletions: [
          {
            status: AccountDeletionStatus.AWAITING_ACTIVE_JOBS,
            scope: AccountDeletionScope.CUSTOMER_PROFILE,
            customerProfileId: 'customer-user-1',
          },
        ],
        blockingJobs: 0,
      });
      const service = createAccountDeletionService({
        prisma,
        config: config(),
        storage,
        realtime,
        supabaseAdmin: { deleteUser: jest.fn() },
      });

      // The same identity has re-registered as a fresh, live customer while the
      // original deletion was still deferred. The sweeper must tombstone the
      // frozen original and leave the new surface alone.
      prisma.__customers.push({
        id: 'customer-2',
        userId: 'user-1',
        deletedAt: null,
        deletionRequestedAt: null,
        displayName: 'Asha',
        avatarUrl: null,
      });

      await service.sweep();

      const original = prisma.__customers.find((c) => c.id === 'customer-user-1')!;
      const fresh = prisma.__customers.find((c) => c.id === 'customer-2')!;
      expect(original.deletedAt).not.toBeNull();
      expect(original.userId).toBeNull();
      expect(fresh.deletedAt).toBeNull();
      expect(fresh.userId).toBe('user-1');
      expect(fresh.deletionRequestedAt).toBeNull();
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

      const status = await service.getDeletionStatus('user-1', null);

      expect(status.activeJobCount).toBe(1);
      expect(status.canAuthorize).toBe(true);
      expect(status.deleted).toBe(false);
    });

    it('reports the customer surface and the surviving pro profile', async () => {
      const prisma = fakePrisma({ customers: ['user-1'] });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const status = await service.getDeletionStatus('user-1', 'customer');

      expect(status.scope).toBe(AccountDeletionScope.CUSTOMER_PROFILE);
      expect(status.hasProProfile).toBe(true);
      expect(status.hasCustomerProfile).toBe(true);
      expect(status.deleted).toBe(false);
    });

    it('reports a completed deletion as deleted', async () => {
      const prisma = fakePrisma({
        deletions: [{ status: AccountDeletionStatus.COMPLETED }],
        pros: [{ deletedAt: new Date(), deletionRequestedAt: new Date() }],
      });
      const service = createAccountDeletionService({ prisma, config: config(), storage, realtime });

      const status = await service.getDeletionStatus('user-1', null);

      expect(status.deleted).toBe(true);
      expect(status.inProgress).toBe(false);
    });
  });
});
