import { z } from 'zod';
import { GENDER_VALUES } from './constants';
import { coordinatesSchema } from './primitives';
import { displayNameSchema } from './pro';

/**
 * Customer onboarding input schemas, shared by the app and the API.
 *
 * Each step submits only its own fields so progress is saved incrementally.
 */
export const customerOnboardingNameSchema = z.object({
  displayName: displayNameSchema,
});

export const customerOnboardingGenderSchema = z.object({
  gender: z.enum(GENDER_VALUES),
});

export const customerOnboardingAddressSchema = z.object({
  coordinates: coordinatesSchema.optional(),
  locationLabel: z.string().trim().max(120).optional(),
  /** Durable place id for the label, so it can be re-resolved on read. */
  locationPlaceId: z.string().trim().max(512).nullable().optional(),
});

/**
 * Any single customer onboarding step.
 *
 * A partial update: only the keys present are written.
 */
export const customerOnboardingPatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    gender: z.enum(GENDER_VALUES).optional(),
    coordinates: coordinatesSchema.optional(),
    locationLabel: z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: z.string().trim().max(512).nullable().optional(),
    avatarUrl: z.url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type CustomerOnboardingPatchInput = z.infer<typeof customerOnboardingPatchSchema>;

/**
 * Step 3 of the avatar upload handshake.
 *
 * The client sends back the object path the API minted in step 1. The server
 * still owns the real check — the path must sit under the caller's own id and
 * its own surface — but the schema bounds its shape up-front so foreign paths
 * never reach the storage layer.
 */
export const avatarCompleteSchema = z.strictObject({
  path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^customers\/[^/]+\/avatar-[^/]+\.jpg$/i, 'The photo path is not valid.'),
});

export type AvatarCompleteInput = z.infer<typeof avatarCompleteSchema>;
