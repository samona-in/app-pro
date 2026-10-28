import { z } from 'zod';
export declare const createBannerSchema: z.ZodObject<{
    key: z.ZodString;
    heading: z.ZodString;
    subtitle: z.ZodString;
    ctaLabel: z.ZodString;
    serviceSlug: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    image: z.ZodString;
    imageDescription: z.ZodString;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const updateBannerSchema: z.ZodObject<{
    key: z.ZodOptional<z.ZodString>;
    heading: z.ZodOptional<z.ZodString>;
    subtitle: z.ZodOptional<z.ZodString>;
    ctaLabel: z.ZodOptional<z.ZodString>;
    serviceSlug: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    image: z.ZodOptional<z.ZodString>;
    imageDescription: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
//# sourceMappingURL=banner.d.ts.map