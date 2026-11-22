import { z } from 'zod';

/**
 * Only http(s) is accepted: the customer app hands this value straight to
 * `Linking.openURL`, so javascript:, data: and app-specific schemes must never
 * reach it from an admin form.
 */
// Empty means "no link": the admin form sends an empty input when the field is
// left blank, and the stored value is null either way.
const linkUrlSchema = z
  .union([
    z.literal(''),
    z
      .string()
      .url('Enter a full URL, starting with https://')
      .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links are allowed'),
  ])
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const bannerFields = {
  key: z.string().min(1),
  type: z.enum(['PROMO', 'IMAGE']).default('PROMO'),
  image: z.string().min(1),
  imageDescription: z.string().min(1),
  linkUrl: linkUrlSchema,
  heading: z.string().optional(),
  subtitle: z.string().optional(),
  ctaLabel: z.string().optional(),
  serviceSlug: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
};

const PROMO_COPY_FIELDS = ['heading', 'subtitle', 'ctaLabel'] as const;

export const createBannerSchema = z.object(bannerFields).superRefine((banner, ctx) => {
  if (banner.type !== 'PROMO') return;

  for (const field of PROMO_COPY_FIELDS) {
    if (!banner[field]?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} is required for a promo banner`,
        path: [field],
      });
    }
  }
});

export const updateBannerSchema = z.object(bannerFields).partial();

export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
