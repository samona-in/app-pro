import { z } from 'zod';
import {
  JOB_CUSTOM_SKILL_MAX,
  JOB_CUSTOM_SKILL_MIN,
  JOB_DESCRIPTION_MIN,
  JOB_IMAGE_LIMIT,
  JOB_STATUSES,
  OTHER_SKILL_SLUG,
  PLACE_TYPES,
  type JobStatus,
} from '@samona/types';
import { coordinatesSchema, latitudeSchema, longitudeSchema, slugSchema } from './primitives';

/** Every valid lifecycle status, for filtering a caller's own job lists. */
const jobStatusOptions = JOB_STATUSES as [JobStatus, ...JobStatus[]];

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

/** Optional display label for the place the work happens. */
export const jobLocationLabelSchema = z
  .string()
  .trim()
  .min(2, 'Tell us where the work happens.')
  .max(160, 'Keep the location under 160 characters.');

/** A submitted storage path for one attached photo (0–5). */
export const jobImagePathSchema = z
  .string()
  .min(1, 'Image path is required.')
  .max(300, 'Image path is invalid.');

/**
 * The free-text category next to the `other` sentinel skill. Only meaningful
 * (and only accepted) when `skillSlug` is `other` — see `createJobSchema`.
 */
export const customSkillSchema = z
  .string()
  .trim()
  .min(JOB_CUSTOM_SKILL_MIN, `Tell us a little more — at least ${JOB_CUSTOM_SKILL_MIN} characters.`)
  .max(JOB_CUSTOM_SKILL_MAX, `Keep it under ${JOB_CUSTOM_SKILL_MAX} characters.`);

/**
 * Creates a job request (the customer booking flow's final step).
 *
 * The service and skill are addressed by slug so the request stays stable
 * across catalogue re-seeds. The server resolves them to ids and confirms the
 * skill belongs to the service; nothing id-based from the client is trusted.
 *
 * Choosing the `other` sentinel skill requires `customSkill` — the free-text
 * category; any other skill must leave it empty.
 */
export const createJobSchema = z
  .object({
    serviceSlug: slugSchema,
    skillSlug: slugSchema,
    customSkill: customSkillSchema.optional(),
    placeType: z.enum(placeTypeOptions),
    placeDescription: placeDescriptionSchema.optional(),
    // The work location, snapshotted onto the job at creation (CLAUDE "jobs"
    // location snapshot). Coordinates come as a pair; the server falls back to
    // the customer profile's saved location when none is submitted.
    locationLabel: jobLocationLabelSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
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

    if (value.skillSlug === OTHER_SKILL_SLUG && !value.customSkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tell us what you need done.',
        path: ['customSkill'],
      });
    }

    if (value.skillSlug !== OTHER_SKILL_SLUG && value.customSkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only the "Other" category takes a custom skill.',
        path: ['customSkill'],
      });
    }

    const hasLat = value.latitude !== undefined;
    const hasLon = value.longitude !== undefined;
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latitude and longitude must be provided together.',
        path: hasLat ? ['longitude'] : ['latitude'],
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** The on-site stages an assigned pro drives a confirmed job through. */
export const JOB_ACTIONS = ['travel', 'arrived', 'start', 'complete'] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

/** Moves a confirmed job through one on-site stage. */
export const transitionJobSchema = z.object({
  action: z.enum(JOB_ACTIONS),
  /** Optional context, e.g. a note to the customer. */
  note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
});

export type TransitionJobInput = z.infer<typeof transitionJobSchema>;

/** Optional context for a cancellation; never loaded with meaning. */
export const cancelJobSchema = z.object({
  note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
});

export type CancelJobInput = z.infer<typeof cancelJobSchema>;

/** List of a caller's own jobs, optionally filtered by one status. */
export const jobListQuerySchema = z.object({
  status: z.enum(jobStatusOptions).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;
