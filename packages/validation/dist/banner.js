"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBannerSchema = exports.createBannerSchema = void 0;
const zod_1 = require("zod");
exports.createBannerSchema = zod_1.z.object({
    key: zod_1.z.string().min(1),
    heading: zod_1.z.string().min(1),
    subtitle: zod_1.z.string().min(1),
    ctaLabel: zod_1.z.string().min(1),
    serviceSlug: zod_1.z.string().nullable().optional(),
    image: zod_1.z.string().min(1),
    imageDescription: zod_1.z.string().min(1),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.updateBannerSchema = zod_1.z.object({
    key: zod_1.z.string().min(1).optional(),
    heading: zod_1.z.string().min(1).optional(),
    subtitle: zod_1.z.string().min(1).optional(),
    ctaLabel: zod_1.z.string().min(1).optional(),
    serviceSlug: zod_1.z.string().nullable().optional(),
    image: zod_1.z.string().min(1).optional(),
    imageDescription: zod_1.z.string().min(1).optional(),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional(),
});
//# sourceMappingURL=banner.js.map