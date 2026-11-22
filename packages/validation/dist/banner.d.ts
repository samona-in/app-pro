import { z } from 'zod';
export declare const createBannerSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<{
        PROMO: "PROMO";
        IMAGE: "IMAGE";
    }>>;
    image: z.ZodString;
    imageDescription: z.ZodString;
    linkUrl: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodString]>, z.ZodTransform<string | null, string>>>>;
    heading: z.ZodOptional<z.ZodString>;
    subtitle: z.ZodOptional<z.ZodString>;
    ctaLabel: z.ZodOptional<z.ZodString>;
    serviceSlug: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const updateBannerSchema: z.ZodObject<{
    key: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        PROMO: "PROMO";
        IMAGE: "IMAGE";
    }>>>;
    image: z.ZodOptional<z.ZodString>;
    imageDescription: z.ZodOptional<z.ZodString>;
    linkUrl: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodUnion<readonly [z.ZodLiteral<"">, z.ZodString]>, z.ZodTransform<string | null, string>>>>>;
    heading: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    subtitle: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    ctaLabel: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    serviceSlug: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    sortOrder: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    isActive: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
//# sourceMappingURL=banner.d.ts.map