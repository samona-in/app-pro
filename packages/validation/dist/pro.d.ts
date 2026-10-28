import { z } from 'zod';
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
export declare const displayNameSchema: z.ZodString;
export declare const bioSchema: z.ZodString;
export declare const experienceLevelSchema: z.ZodEnum<{
    UNDER_1_YEAR: "UNDER_1_YEAR";
    ONE_TO_THREE: "ONE_TO_THREE";
    THREE_TO_FIVE: "THREE_TO_FIVE";
    FIVE_TO_TEN: "FIVE_TO_TEN";
    TEN_PLUS: "TEN_PLUS";
}>;
export declare const serviceRadiusSchema: z.ZodNumber;
export declare const languagesSchema: z.ZodArray<z.ZodString>;
/** Step 2 — name. */
export declare const onboardingNameSchema: z.ZodObject<{
    displayName: z.ZodString;
}, z.core.$strip>;
/** Step 3 — gender. Male, female or other. */
export declare const genderSchema: z.ZodEnum<{
    OTHER: "OTHER";
    MALE: "MALE";
    FEMALE: "FEMALE";
}>;
export declare const onboardingGenderSchema: z.ZodObject<{
    gender: z.ZodEnum<{
        OTHER: "OTHER";
        MALE: "MALE";
        FEMALE: "FEMALE";
    }>;
}, z.core.$strip>;
/** Step 4 — services. At least one, or there is nothing to match on. */
export declare const onboardingServicesSchema: z.ZodObject<{
    serviceIds: z.ZodArray<z.ZodUUID>;
}, z.core.$strip>;
/** Step 5 — specialties within the chosen services. */
export declare const onboardingSkillsSchema: z.ZodObject<{
    skillIds: z.ZodArray<z.ZodUUID>;
}, z.core.$strip>;
/** Step 6 — experience. */
export declare const onboardingExperienceSchema: z.ZodObject<{
    experienceLevel: z.ZodEnum<{
        UNDER_1_YEAR: "UNDER_1_YEAR";
        ONE_TO_THREE: "ONE_TO_THREE";
        THREE_TO_FIVE: "THREE_TO_FIVE";
        FIVE_TO_TEN: "FIVE_TO_TEN";
        TEN_PLUS: "TEN_PLUS";
    }>;
}, z.core.$strip>;
/** Step 7 — where they work. Coordinates are optional: a Pro may decline the
 *  location permission and still finish onboarding. */
export declare const onboardingLocationSchema: z.ZodObject<{
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
/** Step 8 — how far they travel to jobs. */
export declare const onboardingRadiusSchema: z.ZodObject<{
    serviceRadiusKm: z.ZodNumber;
}, z.core.$strip>;
/** Step 9 — how they describe themselves. */
export declare const onboardingAboutSchema: z.ZodObject<{
    bio: z.ZodOptional<z.ZodString>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
/**
 * Step 10 — face verification.
 *
 * Both requests carry no fields by design. The storage path is derived from
 * the caller's verified user id server-side, so there is nothing a client
 * could forge: one account can only ever mint upload URLs for, and confirm,
 * its own selfie.
 */
export declare const selfieUploadStartSchema: z.ZodObject<{}, z.core.$strict>;
export declare const selfieCompleteSchema: z.ZodObject<{}, z.core.$strict>;
/**
 * Any single onboarding step.
 *
 * A partial update: only the keys present are written, so one step cannot
 * blank out another step's answers.
 */
export declare const onboardingPatchSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
    gender: z.ZodOptional<z.ZodEnum<{
        OTHER: "OTHER";
        MALE: "MALE";
        FEMALE: "FEMALE";
    }>>;
    serviceIds: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
    skillIds: z.ZodOptional<z.ZodArray<z.ZodUUID>>;
    experienceLevel: z.ZodOptional<z.ZodEnum<{
        UNDER_1_YEAR: "UNDER_1_YEAR";
        ONE_TO_THREE: "ONE_TO_THREE";
        THREE_TO_FIVE: "THREE_TO_FIVE";
        FIVE_TO_TEN: "FIVE_TO_TEN";
        TEN_PLUS: "TEN_PLUS";
    }>>;
    serviceRadiusKm: z.ZodOptional<z.ZodNumber>;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bio: z.ZodOptional<z.ZodString>;
    languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type OnboardingPatchInput = z.infer<typeof onboardingPatchSchema>;
export type OnboardingLocationInput = z.infer<typeof onboardingLocationSchema>;
export type OnboardingRadiusInput = z.infer<typeof onboardingRadiusSchema>;
export type SelfieUploadStartInput = z.infer<typeof selfieUploadStartSchema>;
export type SelfieCompleteInput = z.infer<typeof selfieCompleteSchema>;
/**
 * The online/offline switch that gates matching. Coordinates refresh when a
 * Pro goes online; going offline keeps the last known position.
 */
export declare const availabilityPatchSchema: z.ZodObject<{
    isOnline: z.ZodBoolean;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;
/**
 * `PATCH /pros/me/service-radius` — the Service Areas screen's radius control.
 *
 * Same bounds as the onboarding radius step, under its own name so the
 * settings contract and the onboarding step can evolve independently.
 */
export declare const serviceRadiusPatchSchema: z.ZodObject<{
    serviceRadiusKm: z.ZodNumber;
}, z.core.$strip>;
export type ServiceRadiusPatchInput = z.infer<typeof serviceRadiusPatchSchema>;
/**
 * `POST /pros/services/:serviceId/request` path.
 *
 * A malformed id must fail validation (422) rather than reach Prisma, which
 * rejects it as a 500.
 */
export declare const serviceIdParamsSchema: z.ZodObject<{
    serviceId: z.ZodUUID;
}, z.core.$strip>;
//# sourceMappingURL=pro.d.ts.map