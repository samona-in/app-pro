"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceIdParamsSchema = exports.serviceRadiusPatchSchema = exports.availabilityPatchSchema = exports.onboardingPatchSchema = exports.selfieCompleteSchema = exports.selfieUploadStartSchema = exports.onboardingAboutSchema = exports.onboardingRadiusSchema = exports.onboardingLocationSchema = exports.onboardingExperienceSchema = exports.onboardingSkillsSchema = exports.onboardingServicesSchema = exports.onboardingGenderSchema = exports.genderSchema = exports.onboardingNameSchema = exports.languagesSchema = exports.serviceRadiusSchema = exports.experienceLevelSchema = exports.bioSchema = exports.displayNameSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("./constants");
const primitives_1 = require("./primitives");
/**
 * Onboarding input schemas, shared by the app and the API.
 *
 * Each onboarding step submits only its own fields, so progress is saved as the
 * Pro goes rather than lost if they close the app. Every field is optional at
 * the schema level for that reason; the *completeness* rule lives in
 * `isProProfileComplete` in `@samona/types`, not here.
 *
 * Server-controlled fields — isVerified, rating, completedJobs, userId — are
 * absent by construction. A client cannot submit what the schema will not
 * accept, so the API strips them before they reach Prisma.
 */
exports.displayNameSchema = primitives_1.fullNameSchema;
exports.bioSchema = zod_1.z.string().trim().max(600, 'Keep your description under 600 characters.');
exports.experienceLevelSchema = zod_1.z.enum(constants_1.EXPERIENCE_LEVELS);
exports.serviceRadiusSchema = zod_1.z
    .number()
    .int('Choose one of the offered distances.')
    .min(1, 'Service radius must be at least 1 km.')
    .max(50, 'Service radius cannot exceed 50 km.');
exports.languagesSchema = zod_1.z
    .array(zod_1.z.string().trim().min(2).max(40))
    .max(constants_1.LANGUAGE_MAX, `Pick at most ${constants_1.LANGUAGE_MAX} languages.`);
/** Step 2 — name. */
exports.onboardingNameSchema = zod_1.z.object({
    displayName: exports.displayNameSchema,
});
/** Step 3 — gender. Male, female or other. */
exports.genderSchema = zod_1.z.enum(constants_1.GENDER_VALUES);
exports.onboardingGenderSchema = zod_1.z.object({
    gender: exports.genderSchema,
});
/** Step 4 — services. At least one, or there is nothing to match on. */
exports.onboardingServicesSchema = zod_1.z.object({
    serviceIds: zod_1.z.array(primitives_1.idSchema).min(1, 'Choose at least one service.'),
});
/** Step 5 — specialties within the chosen services. */
exports.onboardingSkillsSchema = zod_1.z.object({
    skillIds: zod_1.z.array(primitives_1.idSchema).min(1, 'Choose at least one specialty.'),
});
/** Step 6 — experience. */
exports.onboardingExperienceSchema = zod_1.z.object({
    experienceLevel: exports.experienceLevelSchema,
});
/** Step 7 — where they work. Coordinates are optional: a Pro may decline the
 *  location permission and still finish onboarding. */
exports.onboardingLocationSchema = zod_1.z.object({
    coordinates: primitives_1.coordinatesSchema.optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
});
/** Step 8 — how far they travel to jobs. */
exports.onboardingRadiusSchema = zod_1.z.object({
    serviceRadiusKm: exports.serviceRadiusSchema,
});
/** Step 9 — how they describe themselves. */
exports.onboardingAboutSchema = zod_1.z.object({
    bio: exports.bioSchema.optional(),
    languages: exports.languagesSchema.optional(),
});
/**
 * Step 10 — face verification.
 *
 * Both requests carry no fields by design. The storage path is derived from
 * the caller's verified user id server-side, so there is nothing a client
 * could forge: one account can only ever mint upload URLs for, and confirm,
 * its own selfie.
 */
exports.selfieUploadStartSchema = zod_1.z.strictObject({});
exports.selfieCompleteSchema = zod_1.z.strictObject({});
/**
 * Any single onboarding step.
 *
 * A partial update: only the keys present are written, so one step cannot
 * blank out another step's answers.
 */
exports.onboardingPatchSchema = zod_1.z
    .object({
    displayName: exports.displayNameSchema.optional(),
    gender: exports.genderSchema.optional(),
    serviceIds: zod_1.z.array(primitives_1.idSchema).optional(),
    skillIds: zod_1.z.array(primitives_1.idSchema).optional(),
    experienceLevel: exports.experienceLevelSchema.optional(),
    serviceRadiusKm: exports.serviceRadiusSchema.optional(),
    coordinates: primitives_1.coordinatesSchema.optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
    bio: exports.bioSchema.optional(),
    languages: exports.languagesSchema.optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
});
/**
 * The online/offline switch that gates matching. Coordinates refresh when a
 * Pro goes online; going offline keeps the last known position.
 */
exports.availabilityPatchSchema = zod_1.z.object({
    isOnline: zod_1.z.boolean(),
    coordinates: primitives_1.coordinatesSchema.optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
});
/**
 * `PATCH /pros/me/service-radius` — the Service Areas screen's radius control.
 *
 * Same bounds as the onboarding radius step, under its own name so the
 * settings contract and the onboarding step can evolve independently.
 */
exports.serviceRadiusPatchSchema = zod_1.z.object({
    serviceRadiusKm: exports.serviceRadiusSchema,
});
/**
 * `POST /pros/services/:serviceId/request` path.
 *
 * A malformed id must fail validation (422) rather than reach Prisma, which
 * rejects it as a 500.
 */
exports.serviceIdParamsSchema = zod_1.z.object({
    serviceId: primitives_1.idSchema,
});
//# sourceMappingURL=pro.js.map