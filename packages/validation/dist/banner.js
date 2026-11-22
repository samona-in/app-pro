"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBannerSchema = exports.createBannerSchema = void 0;
const zod_1 = require("zod");
/**
 * Only http(s) is accepted: the customer app hands this value straight to
 * `Linking.openURL`, so javascript:, data: and app-specific schemes must never
 * reach it from an admin form.
 */
// Empty means "no link": the admin form sends an empty input when the field is
// left blank, and the stored value is null either way.
const linkUrlSchema = zod_1.z
    .union([
    zod_1.z.literal(''),
    zod_1.z
        .string()
        .url('Enter a full URL, starting with https://')
        .refine((value) => /^https?:\/\//i.test(value), 'Only http and https links are allowed'),
])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
const bannerFields = {
    key: zod_1.z.string().min(1),
    type: zod_1.z.enum(['PROMO', 'IMAGE']).default('PROMO'),
    image: zod_1.z.string().min(1),
    imageDescription: zod_1.z.string().min(1),
    linkUrl: linkUrlSchema,
    heading: zod_1.z.string().optional(),
    subtitle: zod_1.z.string().optional(),
    ctaLabel: zod_1.z.string().optional(),
    serviceSlug: zod_1.z.string().nullable().optional(),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional(),
};
const PROMO_COPY_FIELDS = ['heading', 'subtitle', 'ctaLabel'];
exports.createBannerSchema = zod_1.z.object(bannerFields).superRefine((banner, ctx) => {
    if (banner.type !== 'PROMO')
        return;
    for (const field of PROMO_COPY_FIELDS) {
        if (!banner[field]?.trim()) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `${field} is required for a promo banner`,
                path: [field],
            });
        }
    }
});
exports.updateBannerSchema = zod_1.z.object(bannerFields).partial();
//# sourceMappingURL=banner.js.map