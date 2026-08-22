import {
  onboardingPatchSchema,
  onboardingServicesSchema,
  onboardingSkillsSchema,
} from '@samona/validation';

/**
 * The onboarding input contract.
 *
 * These assert what a client is *not* allowed to send as much as what it is:
 * server-controlled fields must be impossible to submit, not merely ignored.
 */
describe('onboardingPatchSchema', () => {
  it('accepts a single step on its own', () => {
    // Partial updates are the whole point: progress saves as the Pro goes.
    expect(onboardingPatchSchema.safeParse({ displayName: 'Asha Kumar' }).success).toBe(true);
    expect(onboardingPatchSchema.safeParse({ serviceRadiusKm: 15 }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(onboardingPatchSchema.safeParse({}).success).toBe(false);
  });

  it('strips server-controlled fields rather than trusting them', () => {
    const result = onboardingPatchSchema.safeParse({
      displayName: 'Asha Kumar',
      isVerified: true,
      rating: 5,
      completedJobs: 999,
      onboardingStatus: 'COMPLETED',
      userId: 'someone-else',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // A Pro must not be able to verify themselves or declare onboarding done.
    expect(result.data).toEqual({ displayName: 'Asha Kumar' });
    expect(result.data).not.toHaveProperty('isVerified');
    expect(result.data).not.toHaveProperty('onboardingStatus');
    expect(result.data).not.toHaveProperty('userId');
  });

  it('bounds the service radius', () => {
    expect(onboardingPatchSchema.safeParse({ serviceRadiusKm: 0 }).success).toBe(false);
    expect(onboardingPatchSchema.safeParse({ serviceRadiusKm: 500 }).success).toBe(false);
    expect(onboardingPatchSchema.safeParse({ serviceRadiusKm: 20 }).success).toBe(true);
  });

  it('rejects coordinates outside the real world', () => {
    expect(
      onboardingPatchSchema.safeParse({ coordinates: { latitude: 99, longitude: 0 } }).success,
    ).toBe(false);
  });

  it('bounds the bio so one Pro cannot store a novel', () => {
    expect(onboardingPatchSchema.safeParse({ bio: 'x'.repeat(601) }).success).toBe(false);
  });
});

describe('step schemas', () => {
  it('require at least one service', () => {
    expect(onboardingServicesSchema.safeParse({ serviceIds: [] }).success).toBe(false);
  });

  it('require at least one specialty', () => {
    expect(onboardingSkillsSchema.safeParse({ skillIds: [] }).success).toBe(false);
  });

  it('reject ids that are not ids', () => {
    expect(onboardingServicesSchema.safeParse({ serviceIds: ['not-a-uuid'] }).success).toBe(false);
  });
});
