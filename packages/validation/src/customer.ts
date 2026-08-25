import { z } from 'zod';
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

export const customerOnboardingAddressSchema = z.object({
  coordinates: coordinatesSchema.optional(),
  locationLabel: z.string().trim().max(120).optional(),
});

/**
 * Any single customer onboarding step.
 *
 * A partial update: only the keys present are written.
 */
export const customerOnboardingPatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    coordinates: coordinatesSchema.optional(),
    locationLabel: z.string().trim().max(120).optional(),
    avatarUrl: z.url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type CustomerOnboardingPatchInput = z.infer<typeof customerOnboardingPatchSchema>;
