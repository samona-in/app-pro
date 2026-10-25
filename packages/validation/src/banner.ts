import { z } from 'zod';

export const createBannerSchema = z.object({
  key: z.string().min(1),
  heading: z.string().min(1),
  subtitle: z.string().min(1),
  ctaLabel: z.string().min(1),
  serviceSlug: z.string().nullable().optional(),
  image: z.string().min(1),
  imageDescription: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateBannerSchema = z.object({
  key: z.string().min(1).optional(),
  heading: z.string().min(1).optional(),
  subtitle: z.string().min(1).optional(),
  ctaLabel: z.string().min(1).optional(),
  serviceSlug: z.string().nullable().optional(),
  image: z.string().min(1).optional(),
  imageDescription: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
