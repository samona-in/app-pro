import { z } from 'zod';
import { EXPERIENCE_LEVELS, GENDER_VALUES, LANGUAGE_MAX } from './constants';
import { fullNameSchema, idSchema, coordinatesSchema } from './primitives';

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
export const displayNameSchema = fullNameSchema;

export const bioSchema = z.string().trim().max(600, 'Keep your description under 600 characters.');

export const experienceLevelSchema = z.enum(EXPERIENCE_LEVELS);

export const serviceRadiusSchema = z
  .number()
  .int('Choose one of the offered distances.')
  .min(1, 'Service radius must be at least 1 km.')
  .max(50, 'Service radius cannot exceed 50 km.');

export const languagesSchema = z
  .array(z.string().trim().min(2).max(40))
  .max(LANGUAGE_MAX, `Pick at most ${LANGUAGE_MAX} languages.`);

/** Step 2 — name. */
export const onboardingNameSchema = z.object({
  displayName: displayNameSchema,
});

/** Step 3 — gender. Male, female or other. */
export const genderSchema = z.enum(GENDER_VALUES);

export const onboardingGenderSchema = z.object({
  gender: genderSchema,
});

/** Step 4 — services. At least one, or there is nothing to match on. */
export const onboardingServicesSchema = z.object({
  serviceIds: z.array(idSchema).min(1, 'Choose at least one service.'),
});

/** Step 5 — specialties within the chosen services. */
export const onboardingSkillsSchema = z.object({
  skillIds: z.array(idSchema).min(1, 'Choose at least one specialty.'),
});

/** Step 6 — experience. */
export const onboardingExperienceSchema = z.object({
  experienceLevel: experienceLevelSchema,
});

/** Step 7 — where they work. Coordinates are optional: a Pro may decline the
 *  location permission and still finish onboarding. */
export const onboardingLocationSchema = z.object({
  coordinates: coordinatesSchema.optional(),
  locationLabel: z.string().trim().max(120).optional(),
});

/** Step 8 — how far they travel to jobs. */
export const onboardingRadiusSchema = z.object({
  serviceRadiusKm: serviceRadiusSchema,
});

/** Step 9 — how they describe themselves. */
export const onboardingAboutSchema = z.object({
  bio: bioSchema.optional(),
  languages: languagesSchema.optional(),
  avatarUrl: z.url().optional(),
});

/**
 * Step 10 — face verification.
 *
 * Both requests carry no fields by design. The storage path is derived from
 * the caller's verified user id server-side, so there is nothing a client
 * could forge: one account can only ever mint upload URLs for, and confirm,
 * its own selfie.
 */
export const selfieUploadStartSchema = z.strictObject({});

export const selfieCompleteSchema = z.strictObject({});

/**
 * Any single onboarding step.
 *
 * A partial update: only the keys present are written, so one step cannot
 * blank out another step's answers.
 */
export const onboardingPatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    gender: genderSchema.optional(),
    serviceIds: z.array(idSchema).optional(),
    skillIds: z.array(idSchema).optional(),
    experienceLevel: experienceLevelSchema.optional(),
    serviceRadiusKm: serviceRadiusSchema.optional(),
    coordinates: coordinatesSchema.optional(),
    locationLabel: z.string().trim().max(120).optional(),
    bio: bioSchema.optional(),
    languages: languagesSchema.optional(),
    avatarUrl: z.url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type OnboardingPatchInput = z.infer<typeof onboardingPatchSchema>;
export type OnboardingLocationInput = z.infer<typeof onboardingLocationSchema>;
export type OnboardingRadiusInput = z.infer<typeof onboardingRadiusSchema>;
export type SelfieUploadStartInput = z.infer<typeof selfieUploadStartSchema>;
export type SelfieCompleteInput = z.infer<typeof selfieCompleteSchema>;

/**
 * The online/offline switch that gates matching. Coordinates refresh when a
 * Pro goes online; going offline keeps the last known position.
 */
export const availabilityPatchSchema = z.object({
  isOnline: z.boolean(),
  coordinates: coordinatesSchema.optional(),
  locationLabel: z.string().trim().max(120).optional(),
});

export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;
