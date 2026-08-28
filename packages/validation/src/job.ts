import { z } from 'zod';
import { JOB_DESCRIPTION_MIN, JOB_IMAGE_LIMIT, PLACE_TYPES } from '@samona/types';
import { slugSchema } from './primitives';

/** Where the work happens. Mirrors the `PlaceType` enum in @samona/types. */
const placeTypeOptions = PLACE_TYPES.map((option) => option.value) as [
  (typeof PLACE_TYPES)[number]['value'],
  ...(typeof PLACE_TYPES)[number]['value'][],
];

/** Use this when `placeType` is OTHER to name the place. */
export const placeDescriptionSchema = z
  .string()
  .trim()
  .min(2, 'Describe the place briefly.')
  .max(120, 'Keep the place description under 120 characters.');

/** Free-text description of the requested work. */
export const jobDescriptionSchema = z
  .string()
  .trim()
  .min(JOB_DESCRIPTION_MIN, `Tell us a little more — at least ${JOB_DESCRIPTION_MIN} characters.`)
  .max(2000, 'Keep the description under 2000 characters.');

/** New-image price the customer commits to, in paise. At least ₹1. */
export const basePayPaiseSchema = z
  .number()
  .int('Amount must be a whole number.')
  .min(100, 'Base pay must be at least ₹1.')
  .max(100_000_000, 'That amount is too large.');

/** A submitted storage path for one attached photo (0–5). */
export const jobImagePathSchema = z
  .string()
  .min(1, 'Image path is required.')
  .max(300, 'Image path is invalid.');

/**
 * Creates a job request (the customer booking flow's final step).
 *
 * The service and skill are addressed by slug so the request stays stable
 * across catalogue re-seeds. The server resolves them to ids and confirms the
 * skill belongs to the service; nothing id-based from the client is trusted.
 */
export const createJobSchema = z
  .object({
    serviceSlug: slugSchema,
    skillSlug: slugSchema,
    placeType: z.enum(placeTypeOptions),
    placeDescription: placeDescriptionSchema.optional(),
    description: jobDescriptionSchema,
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
    basePayPaise: basePayPaiseSchema,
  })
  .superRefine((value, ctx) => {
    if (value.placeType === 'OTHER' && !value.placeDescription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tell us what kind of place it is.',
        path: ['placeDescription'],
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;
