import { z } from 'zod';
import {
  JOB_CUSTOM_SKILL_MAX,
  JOB_CUSTOM_SKILL_MIN,
  JOB_DESCRIPTION_MAX,
  JOB_IMAGE_LIMIT,
  JOB_STATUSES,
  OTHER_SKILL_SLUG,
  type JobStatus,
} from '@samona/types';
import {
  coordinatesSchema,
  idSchema,
  latitudeSchema,
  longitudeSchema,
  paginationSchema,
  slugSchema,
} from './primitives';

/** Every valid lifecycle status, for filtering a caller's own job lists. */
const jobStatusOptions = JOB_STATUSES as [JobStatus, ...JobStatus[]];

/**
 * Free-text description of the requested work.
 *
 * Optional: many customers prefer to explain the job in person, so an empty
 * description is valid. When provided it is capped at {@link JOB_DESCRIPTION_MAX}.
 */
export const jobDescriptionSchema = z
  .string()
  .trim()
  .max(JOB_DESCRIPTION_MAX, `Keep the description under ${JOB_DESCRIPTION_MAX} characters.`);

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
    // The work location, snapshotted onto the job at creation (CLAUDE "jobs"
    // location snapshot). Coordinates come as a pair; the server falls back to
    // the customer profile's saved location when none is submitted.
    locationLabel: jobLocationLabelSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    description: jobDescriptionSchema.default(''),
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
    basePayPaise: basePayPaiseSchema,
  })
  .superRefine((value, ctx) => {
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

/**
 * Moves a confirmed job through one on-site stage.
 *
 * The `arrived` action requires the pro's live position so the server can
 * verify they are actually at the work spot before they claim arrival; the
 * other actions do not send coordinates. Validation here stays permissive
 * (coordinates optional) — the proximity rule is enforced authoritatively in
 * the jobs service.
 */
export const transitionJobSchema = z.object({
  action: z.enum(JOB_ACTIONS),
  /** Optional context, e.g. a note to the customer. */
  note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
  /** The pro's live position, required by the server for the `arrived` action. */
  coordinates: coordinatesSchema.optional(),
});

export type TransitionJobInput = z.infer<typeof transitionJobSchema>;

/**
 * Verifies a pro's claim to start work using the one-time code the customer
 * holds.
 *
 * The code is 4 digits, issued once per job and entered by the pro from what
 * the customer reads out. The server compares it in constant time and counts
 * failures so a wrong code cannot be sprayed (server-side brute-force guard).
 */
export const verifyStartSchema = z.object({
  action: z.literal('start'),
  code: z.string().regex(/^\d{4}$/, 'Enter the 4-digit code you got from the customer.'),
});

export type VerifyStartInput = z.infer<typeof verifyStartSchema>;

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

/**
 * Reads `status` as either a comma-separated list or repeated query keys — the
 * two shapes the admin dashboard and ad-hoc API clients naturally send.
 */
function statusListQuery<T extends readonly [JobStatus, ...JobStatus[]]>(options: T) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === '') return undefined;
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap((entry) =>
        typeof entry === 'string' ? entry.split(',').filter(Boolean) : [entry],
      );
    },
    z.array(z.enum(options)).optional(),
  );
}

const jobStatusListQuery = statusListQuery(jobStatusOptions);

/**
 * Statuses a live job can be in: everything before a terminal state.
 *
 * The live board answers "what is happening today", so settled, abandoned and
 * expired work (PAID / CANCELLED / EXPIRED) is deliberately out of scope.
 */
const liveJobStatusOptions = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'TRAVELLING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_PENDING',
] as const satisfies readonly JobStatus[];

const liveJobStatusListQuery = statusListQuery(liveJobStatusOptions);

/** How the live board orders today's rows. */
export const ADMIN_LIVE_SORTS = ['newest', 'oldest', 'amount_desc', 'expiring'] as const;

export type AdminLiveSort = (typeof ADMIN_LIVE_SORTS)[number];

/**
 * Filters for the admin live board: today's still-open jobs only.
 *
 * There is no cursor or date range — the server pins the window to the current
 * day in the operations time zone and returns the whole (bounded) snapshot.
 */
export const adminLiveQuerySchema = z.object({
  status: liveJobStatusListQuery,
  sort: z.enum(ADMIN_LIVE_SORTS).default('newest'),
  q: z.string().trim().max(80, 'Keep the search under 80 characters.').optional(),
});

export type AdminLiveQuery = z.infer<typeof adminLiveQuerySchema>;

/**
 * Filters for the admin bookings ledger.
 *
 * This is the read-only history of every job — including settled and cancelled
 * ones — unlike `jobListQuerySchema`, which only ever filters one caller's own
 * jobs. `cursor` is opaque to the client; the server encodes the last row's
 * `createdAt` + `id` so pages stay stable while new jobs are written.
 */
export const adminJobListQuerySchema = paginationSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: jobStatusListQuery,
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    serviceId: idSchema.optional(),
    proId: idSchema.optional(),
    customerId: idSchema.optional(),
    q: z.string().trim().max(80, 'Keep the search under 80 characters.').optional(),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.to).getTime() > new Date(value.from).getTime(),
    { message: '`to` must be after `from`.', path: ['to'] },
  );

export type AdminJobListQuery = z.infer<typeof adminJobListQuerySchema>;

/**
 * The signed, single-use offer token delivered inside a job alert's FCM data.
 *
 * Redeemable (Accept/Reject) only by native code that holds both this token and
 * the device it was minted for. The server verifies the signature, expiry and
 * device binding, then consumes it atomically so no token can be replayed.
 */
export const jobOfferTokenSchema = z
  .string()
  .min(1, 'Offer token is required.')
  .max(1024, 'Offer token is invalid.');

/**
 * A per-install device identifier, minted by the Android job-alert module and
 * registered with the push token. Binds every minted offer to one device.
 */
export const deviceIdSchema = z
  .string()
  .min(8, 'Device id is invalid.')
  .max(128, 'Device id is invalid.');

/** Redeems a job-offer token by accepting the job. */
export const acceptJobOfferSchema = z.object({
  offerToken: jobOfferTokenSchema,
  deviceId: deviceIdSchema,
});

export type AcceptJobOfferInput = z.infer<typeof acceptJobOfferSchema>;

/** Redeems a job-offer token by declining (rejecting) the job. */
export const rejectJobOfferSchema = z.object({
  offerToken: jobOfferTokenSchema,
  deviceId: deviceIdSchema,
});

export type RejectJobOfferInput = z.infer<typeof rejectJobOfferSchema>;
