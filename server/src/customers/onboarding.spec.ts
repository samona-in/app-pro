import {
  customerOnboardingPatchSchema,
  customerOnboardingNameSchema,
  customerOnboardingAddressSchema,
} from '@samona/validation';

describe('customer onboarding schemas', () => {
  describe('customerOnboardingNameSchema', () => {
    it('accepts a valid name', () => {
      expect(customerOnboardingNameSchema.safeParse({ displayName: 'Priya Sharma' }).success).toBe(
        true,
      );
    });

    it('rejects a name that is too short', () => {
      expect(customerOnboardingNameSchema.safeParse({ displayName: 'A' }).success).toBe(false);
    });

    it('rejects a name that is too long', () => {
      expect(customerOnboardingNameSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(
        false,
      );
    });
  });

  describe('customerOnboardingAddressSchema', () => {
    it('accepts a valid location label', () => {
      expect(
        customerOnboardingAddressSchema.safeParse({ locationLabel: 'MG Road, Hyderabad' }).success,
      ).toBe(true);
    });

    it('accepts coordinates', () => {
      expect(
        customerOnboardingAddressSchema.safeParse({
          coordinates: { latitude: 17.385, longitude: 78.4867 },
        }).success,
      ).toBe(true);
    });

    it('accepts coordinates with a label', () => {
      expect(
        customerOnboardingAddressSchema.safeParse({
          coordinates: { latitude: 17.385, longitude: 78.4867 },
          locationLabel: 'MG Road, Hyderabad',
        }).success,
      ).toBe(true);
    });
  });

  describe('customerOnboardingPatchSchema', () => {
    it('accepts a single step', () => {
      expect(customerOnboardingPatchSchema.safeParse({ displayName: 'Priya' }).success).toBe(true);
      expect(
        customerOnboardingPatchSchema.safeParse({ locationLabel: 'MG Road, Hyderabad' }).success,
      ).toBe(true);
    });

    it('rejects an empty patch', () => {
      expect(customerOnboardingPatchSchema.safeParse({}).success).toBe(false);
    });

    it('strips server-controlled fields', () => {
      const result = customerOnboardingPatchSchema.safeParse({
        displayName: 'Priya',
        onboardingStatus: 'COMPLETED',
        userId: 'someone-else',
        id: 'fake-id',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toEqual({ displayName: 'Priya' });
      expect(result.data).not.toHaveProperty('onboardingStatus');
      expect(result.data).not.toHaveProperty('userId');
      expect(result.data).not.toHaveProperty('id');
    });

    it('accepts multiple fields in one patch', () => {
      const result = customerOnboardingPatchSchema.safeParse({
        displayName: 'Priya',
        locationLabel: 'MG Road, Hyderabad',
      });

      expect(result.success).toBe(true);
    });
  });
});
