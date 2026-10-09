import { createRetentionPolicy } from './policy';
import type { RetentionFeatureFlags } from './types';

describe('retention policy', () => {
  const baseFlags: RetentionFeatureFlags = {
    enabled: false,
    dryRunDefault: true,
    safetyWindowDays: 7,
    categories: {
      proDocuments: false,
      selfies: false,
      avatarsPro: false,
      avatarsCustomer: false,
      jobImages: false,
      notificationsPro: false,
      customerNotifications: false,
      accountDeletionAudit: false,
      savedAddresses: false,
      proServicesSkills: false,
      jobDeclinesOffers: false,
      messages: false,
      jobsCompleted: false,
      jobsCancelled: false,
    },
    lockTtlMs: 300000,
    lockRetryMs: 1000,
  };

  it('never deletes when disabled', () => {
    const policy = createRetentionPolicy({
      config: { proDocuments: 30 },
      flags: {
        ...baseFlags,
        enabled: false,
        categories: { ...baseFlags.categories, proDocuments: true } as any,
      },
    });
    expect(policy.isCategoryEnabled('proDocuments')).toBe(false);
    expect(policy.canDeleteCategory('proDocuments')).toBe(false);
  });

  it('never deletes when period unset', () => {
    const policy = createRetentionPolicy({
      config: {},
      flags: {
        ...baseFlags,
        enabled: true,
        categories: { ...baseFlags.categories, proDocuments: true } as any,
      },
    });
    expect(policy.canDeleteCategory('proDocuments')).toBe(false);
    expect(policy.expirationDate('proDocuments')).toBeUndefined();
  });

  it('allows deletion only if enabled and period set', () => {
    const policy = createRetentionPolicy({
      config: { proDocuments: 30 },
      flags: {
        ...baseFlags,
        enabled: true,
        categories: { ...baseFlags.categories, proDocuments: true } as any,
      },
    });
    expect(policy.canDeleteCategory('proDocuments')).toBe(true);
    expect(policy.expirationDate('proDocuments')).toBeDefined();
  });

  it('never deletes a report-only category, even with flag and period set', () => {
    const policy = createRetentionPolicy({
      config: { messages: 30, jobsCompleted: 30 },
      flags: {
        ...baseFlags,
        enabled: true,
        categories: { ...baseFlags.categories, messages: true, jobsCompleted: true } as any,
      },
    });

    expect(policy.isReportOnly('messages')).toBe(true);
    expect(policy.canDeleteCategory('messages')).toBe(false);
    expect(policy.canDeleteCategory('jobsCompleted')).toBe(false);
    // It still reports the period so operators can see what would age out.
    expect(policy.hasPeriod('messages')).toBe(true);
  });
});
