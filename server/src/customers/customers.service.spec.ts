import {
  isCustomerProfileComplete,
  nextIncompleteCustomerStep,
  CUSTOMER_ONBOARDING_STEPS,
  OnboardingStatus,
  type CustomerProfile,
} from '@samona/types';
import { createCustomersService } from './customers.service';

const base: CustomerProfile = {
  id: 'cust-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.IN_PROGRESS,
  displayName: 'Priya Sharma',
  locationLabel: 'MG Road, Hyderabad, Telangana 500001',
  latitude: 17.385,
  longitude: 78.4867,
  avatarUrl: null,
};

describe('isCustomerProfileComplete', () => {
  it('accepts a profile with a display name', () => {
    expect(isCustomerProfileComplete(base)).toBe(true);
  });

  it('rejects a null profile', () => {
    expect(isCustomerProfileComplete(null)).toBe(false);
  });

  it('rejects a profile with no name', () => {
    expect(isCustomerProfileComplete({ ...base, displayName: null })).toBe(false);
  });

  it('rejects a name that is too short', () => {
    expect(isCustomerProfileComplete({ ...base, displayName: 'A' })).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(isCustomerProfileComplete({ ...base, displayName: '   ' })).toBe(false);
  });
});

describe('nextIncompleteCustomerStep', () => {
  it('starts at intro when there is no profile', () => {
    expect(nextIncompleteCustomerStep(null)).toBe('intro');
  });

  it('resumes at name when the name is missing', () => {
    expect(nextIncompleteCustomerStep({ ...base, displayName: null })).toBe('name');
  });

  it('sends a finished profile to review', () => {
    expect(nextIncompleteCustomerStep(base)).toBe('review');
  });

  it('walks the whole flow in order', () => {
    const empty: CustomerProfile = { ...base, displayName: null };

    expect(nextIncompleteCustomerStep(empty)).toBe('name');
    expect(nextIncompleteCustomerStep({ ...empty, displayName: 'Priya' })).toBe('review');
  });

  it('keeps the customer step list finite and correct', () => {
    expect(CUSTOMER_ONBOARDING_STEPS).toEqual(['intro', 'name', 'address', 'review']);
    expect(CUSTOMER_ONBOARDING_STEPS[CUSTOMER_ONBOARDING_STEPS.length - 1]).toBe('review');
  });
});

describe('createCustomersService', () => {
  function buildService() {
    const rows: Record<string, unknown>[] = [];
    const prisma = {
      customerProfile: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      profile: {
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = createCustomersService({ prisma: prisma as never });
    return { service, prisma, rows };
  }

  it('findByUserId returns null when no profile exists', async () => {
    const { service, prisma } = buildService();
    prisma.customerProfile.findUnique.mockResolvedValue(null);

    const result = await service.findByUserId('user-1');

    expect(result).toBeNull();
    expect(prisma.customerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: expect.anything(),
    });
  });

  it('ensureForUser creates an empty profile on first access', async () => {
    const { service, prisma } = buildService();
    const created = { ...base, onboardingStatus: OnboardingStatus.NOT_STARTED };
    prisma.customerProfile.upsert.mockResolvedValue({
      ...created,
      profile: { avatarUrl: null },
    });

    const result = await service.ensureForUser('user-1');

    expect(prisma.customerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', onboardingStatus: OnboardingStatus.NOT_STARTED },
      }),
    );
    expect(result.onboardingStatus).toBe(OnboardingStatus.NOT_STARTED);
  });

  it('applyOnboardingPatch writes displayName via transaction', async () => {
    const { service, prisma } = buildService();
    const row = { ...base, profile: { avatarUrl: null } };

    prisma.customerProfile.upsert.mockResolvedValue(row);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      return fn(prisma);
    });
    prisma.customerProfile.update.mockResolvedValue(undefined);
    prisma.customerProfile.findUniqueOrThrow.mockResolvedValue({
      ...base,
      displayName: 'Priya Sharma',
      profile: { avatarUrl: null },
    });

    const result = await service.applyOnboardingPatch('user-1', {
      displayName: 'Priya Sharma',
    });

    expect(prisma.customerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: 'Priya Sharma' }),
      }),
    );
    expect(result.displayName).toBe('Priya Sharma');
  });

  it('recomputes status to COMPLETED when profile is complete', async () => {
    const { service, prisma } = buildService();
    const row = { ...base, profile: { avatarUrl: null } };

    prisma.customerProfile.upsert.mockResolvedValue(row);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      return fn(prisma);
    });
    prisma.customerProfile.update.mockResolvedValue(undefined);
    prisma.customerProfile.findUniqueOrThrow.mockResolvedValue({
      ...base,
      displayName: 'Priya Sharma',
      locationLabel: 'MG Road, Hyderabad, Telangana 500001',
      profile: { avatarUrl: null },
    });

    const result = await service.applyOnboardingPatch('user-1', {
      displayName: 'Priya Sharma',
    });

    expect(result.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
  });
});
