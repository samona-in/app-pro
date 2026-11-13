import { z } from 'zod';
import {
  JOB_CUSTOM_SKILL_MAX,
  JOB_CUSTOM_SKILL_MIN,
  JOB_DESCRIPTION_MAX,
  JOB_IMAGE_LIMIT,
  JOB_ITEMS_LIMIT,
  JOB_STATUSES,
  ORDER_GROUP_SERVICES_LIMIT,
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

/**
 * How many countable work units the customer is booking (`PER_UNIT`).
 *
 * The skill's own `minQuantity`/`maxQuantity` are enforced by the server; this
 * only rejects impossible values before the request reaches the catalogue.
 */
export const jobQuantitySchema = z
  .number()
  .int('Quantity must be a whole number.')
  .min(1, 'Book at least one unit.')
  .max(1_000, 'That quantity is too large.');

/**
 * How long the customer wants the work (`PER_HOUR`), in minutes.
 *
 * The skill's configured minimum, maximum and step are enforced by the server.
 */
export const jobDurationMinutesSchema = z
  .number()
  .int('Duration must be a whole number of minutes.')
  .min(1, 'Book at least one minute.')
  .max(24 * 60, 'That duration is too long.');

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
 * One distinct work inside a multi-work request.
 *
 * Each entry is addressed by slug (like the legacy single-work shape) and may
 * carry its own `customSkill` (only for the `other` sentinel), `quantity`
 * (`PER_UNIT` skills) and `durationMinutes` (`PER_HOUR` skills). Pricing is
 * never taken from the client — the server prices every item from the
 * catalogue.
 */
export const createJobItemSchema = z
  .object({
    skillSlug: slugSchema,
    customSkill: customSkillSchema.optional(),
    /** Work units for `PER_UNIT` skills; ignored for the other models. */
    quantity: jobQuantitySchema.default(1),
    /** Duration in minutes for `PER_HOUR` skills; ignored otherwise. */
    durationMinutes: jobDurationMinutesSchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.skillSlug === OTHER_SKILL_SLUG && !item.customSkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tell us what you need done.',
        path: ['customSkill'],
      });
    }

    if (item.skillSlug !== OTHER_SKILL_SLUG && item.customSkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only the "Other" category takes a custom skill.',
        path: ['customSkill'],
      });
    }
  });

export type CreateJobItemInput = z.infer<typeof createJobItemSchema>;

/**
 * Creates a job request (the customer booking flow's final step).
 *
 * The service is addressed by slug, and the works one of two ways:
 *
 * - Legacy single-work shape: `skillSlug` (+ `quantity` / `durationMinutes` /
 *   `customSkill` for that one work). Older app builds keep working unchanged.
 * - Multi-work shape: `items`, a list of distinct works of the same service,
 *   each with its own `quantity` / `durationMinutes` / `customSkill`. Two or
 *   more entries make the request a BULK order.
 *
 * Exactly one of the two shapes may be used — a mixed request is rejected so
 * the pricing input is never ambiguous. Each work may appear only once; to
 * change the quantity of a work the client updates that entry.
 *
 * The works are addressed by slug so the request stays stable across catalogue
 * re-seeds. The server resolves them to ids and confirms every work belongs to
 * the service; nothing id-based from the client is trusted.
 *
 * Pricing is never trusted from the client: `quantity` and `durationMinutes`
 * describe *what* the customer wants, and the server derives every total from
 * the catalogue's current configuration. `basePayPaise` is accepted only so
 * older app builds keep working; the value is ignored.
 */
export const createJobSchema = z
  .object({
    serviceSlug: slugSchema,
    /** The single work (legacy shape). Mutually exclusive with `items`. */
    skillSlug: slugSchema.optional(),
    /** The free-text category for the `other` sentinel (legacy shape). */
    customSkill: customSkillSchema.optional(),
    /**
     * The distinct works in this request (multi-work shape). 1 entry keeps the
     * order SINGLE; 2 or more make it BULK. Mutually exclusive with
     * `skillSlug`.
     */
    items: z.array(createJobItemSchema).min(1).max(JOB_ITEMS_LIMIT).optional(),
    // The work location, snapshotted onto the job at creation (CLAUDE "jobs"
    // location snapshot). Coordinates come as a pair; the server falls back to
    // the customer profile's saved location when none is submitted.
    locationLabel: jobLocationLabelSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    description: jobDescriptionSchema.default(''),
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
    /** Work units for the single `PER_UNIT` work (legacy shape). */
    quantity: jobQuantitySchema.default(1),
    /** Duration in minutes for the single `PER_HOUR` work (legacy shape). */
    durationMinutes: jobDurationMinutesSchema.optional(),
    /**
     * Legacy field. The server computes the total from the catalogue, so this
     * is accepted (older clients still send it) but never written.
     */
    basePayPaise: basePayPaiseSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Exactly one addressing shape: the legacy single work or the item list.
    // A mixed request is ambiguous (which quantity belongs to which work?) so
    // it is rejected rather than guessed at.
    const hasItems = value.items !== undefined;
    const hasLegacySkill = value.skillSlug !== undefined;
    if (hasItems && hasLegacySkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Send either one work or a list of works, not both.',
        path: ['items'],
      });
    }
    if (!hasItems && !hasLegacySkill) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at least one work.',
        path: ['skillSlug'],
      });
    }

    // Legacy single-work rules — mirrored per item in `createJobItemSchema`.
    if (hasLegacySkill) {
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
    }

    // A multi-work request lists distinct works: the same work may not appear
    // twice (its quantity belongs on one entry).
    const items = value.items;
    if (items) {
      const seen = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (seen.has(item.skillSlug)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each work may appear only once — change its quantity instead.',
            path: ['items', index, 'skillSlug'],
          });
        }
        seen.add(item.skillSlug);
      }
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

/**
 * The parsed request the server works with — defaults materialised, so every
 * defaulted field is present.
 */
export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * The request a client submits — the input side of the schema, where fields
 * the validator defaults (`quantity`, `description`, `imagePaths`) may be
 * omitted. The server fills them in during validation.
 */
export type CreateJobRequest = z.input<typeof createJobSchema>;

/**
 * One service's slice of a multi-service checkout.
 *
 * Works are addressed by slug exactly like a single-service request; the server
 * resolves them to ids and confirms every one belongs to this service. Two or
 * more works make this service's job BULK; one keeps it SINGLE.
 */
export const createJobGroupSchema = z
  .object({
    serviceSlug: slugSchema,
    items: z.array(createJobItemSchema).min(1).max(JOB_ITEMS_LIMIT),
  })
  .superRefine((group, ctx) => {
    // Distinct works per service: a work's quantity belongs on one entry.
    const seen = new Set<string>();
    for (const [index, item] of group.items.entries()) {
      if (seen.has(item.skillSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each work may appear only once — change its quantity instead.',
          path: ['items', index, 'skillSlug'],
        });
      }
      seen.add(item.skillSlug);
    }
  });

export type CreateJobGroupInput = z.infer<typeof createJobGroupSchema>;

/**
 * Places one checkout that may span several services.
 *
 * Each group becomes its own job (own pro, lifecycle, OTP, chat, cash payment)
 * and all jobs share a server-generated `orderGroupId`. Notes, photos and the
 * work location are shared by the whole checkout: it is one visit, even when
 * several trades are needed. Services and works are addressed by slug; every
 * price is derived from the catalogue server-side.
 */
export const createJobBatchSchema = z
  .object({
    groups: z.array(createJobGroupSchema).min(1).max(ORDER_GROUP_SERVICES_LIMIT),
    locationLabel: jobLocationLabelSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    description: jobDescriptionSchema.default(''),
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
  })
  .superRefine((value, ctx) => {
    // One group per service: two groups for the same service would create two
    // jobs competing for the same pros, which the cart never means.
    const seen = new Set<string>();
    for (const [index, group] of value.groups.entries()) {
      if (seen.has(group.serviceSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each service may appear only once in a checkout.',
          path: ['groups', index, 'serviceSlug'],
        });
      }
      seen.add(group.serviceSlug);
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

export type CreateJobBatchInput = z.infer<typeof createJobBatchSchema>;
export type CreateJobBatchRequest = z.input<typeof createJobBatchSchema>;

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
