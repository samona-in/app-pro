import { createBannerSchema, updateBannerSchema } from '@samona/validation';

const BASE = {
  key: 'brand-card',
  image: 'https://cdn.example.com/brand-card.png',
  imageDescription: 'A brand visiting card',
};

describe('banner validation', () => {
  it('requires promo copy for the default PROMO type', () => {
    expect(
      createBannerSchema.safeParse({
        ...BASE,
        heading: 'A heading',
        subtitle: 'A subtitle',
        ctaLabel: 'Book now',
      }).success,
    ).toBe(true);

    const result = createBannerSchema.safeParse(BASE);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['heading', 'subtitle', 'ctaLabel']),
      );
    }
  });

  it('lets an IMAGE banner omit promo copy', () => {
    expect(createBannerSchema.safeParse({ ...BASE, type: 'IMAGE' }).success).toBe(true);
  });

  it('accepts only http(s) links and stores a blank link as null', () => {
    expect(createBannerSchema.safeParse({ ...BASE, type: 'IMAGE', linkUrl: '' }).success).toBe(
      true,
    );
    expect(createBannerSchema.parse({ ...BASE, type: 'IMAGE', linkUrl: '' }).linkUrl).toBeNull();
    expect(
      createBannerSchema.safeParse({ ...BASE, type: 'IMAGE', linkUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
    expect(
      createBannerSchema.safeParse({
        ...BASE,
        type: 'IMAGE',
        linkUrl: 'https://brand.example.com',
      }).success,
    ).toBe(true);
  });

  it('validates links on partial updates too', () => {
    expect(updateBannerSchema.safeParse({ linkUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(updateBannerSchema.safeParse({ linkUrl: 'https://brand.example.com' }).success).toBe(
      true,
    );
  });
});
