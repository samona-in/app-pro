"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectJobOfferSchema = exports.acceptJobOfferSchema = exports.deviceIdSchema = exports.jobOfferTokenSchema = exports.adminJobListQuerySchema = exports.adminLiveQuerySchema = exports.ADMIN_LIVE_SORTS = exports.jobListQuerySchema = exports.cancelJobSchema = exports.verifyStartSchema = exports.transitionJobSchema = exports.JOB_ACTIONS = exports.createJobSchema = exports.customSkillSchema = exports.jobImagePathSchema = exports.jobLocationLabelSchema = exports.basePayPaiseSchema = exports.jobDescriptionSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("@samona/types");
const primitives_1 = require("./primitives");
/** Every valid lifecycle status, for filtering a caller's own job lists. */
const jobStatusOptions = types_1.JOB_STATUSES;
/**
 * Free-text description of the requested work.
 *
 * Optional: many customers prefer to explain the job in person, so an empty
 * description is valid. When provided it is capped at {@link JOB_DESCRIPTION_MAX}.
 */
exports.jobDescriptionSchema = zod_1.z
    .string()
    .trim()
    .max(types_1.JOB_DESCRIPTION_MAX, `Keep the description under ${types_1.JOB_DESCRIPTION_MAX} characters.`);
/** New-image price the customer commits to, in paise. At least ₹1. */
exports.basePayPaiseSchema = zod_1.z
    .number()
    .int('Amount must be a whole number.')
    .min(100, 'Base pay must be at least ₹1.')
    .max(100_000_000, 'That amount is too large.');
/** Optional display label for the place the work happens. */
exports.jobLocationLabelSchema = zod_1.z
    .string()
    .trim()
    .min(2, 'Tell us where the work happens.')
    .max(160, 'Keep the location under 160 characters.');
/** A submitted storage path for one attached photo (0–5). */
exports.jobImagePathSchema = zod_1.z
    .string()
    .min(1, 'Image path is required.')
    .max(300, 'Image path is invalid.');
/**
 * The free-text category next to the `other` sentinel skill. Only meaningful
 * (and only accepted) when `skillSlug` is `other` — see `createJobSchema`.
 */
exports.customSkillSchema = zod_1.z
    .string()
    .trim()
    .min(types_1.JOB_CUSTOM_SKILL_MIN, `Tell us a little more — at least ${types_1.JOB_CUSTOM_SKILL_MIN} characters.`)
    .max(types_1.JOB_CUSTOM_SKILL_MAX, `Keep it under ${types_1.JOB_CUSTOM_SKILL_MAX} characters.`);
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
exports.createJobSchema = zod_1.z
    .object({
    serviceSlug: primitives_1.slugSchema,
    skillSlug: primitives_1.slugSchema,
    customSkill: exports.customSkillSchema.optional(),
    // The work location, snapshotted onto the job at creation (CLAUDE "jobs"
    // location snapshot). Coordinates come as a pair; the server falls back to
    // the customer profile's saved location when none is submitted.
    locationLabel: exports.jobLocationLabelSchema.optional(),
    latitude: primitives_1.latitudeSchema.optional(),
    longitude: primitives_1.longitudeSchema.optional(),
    description: exports.jobDescriptionSchema.default(''),
    imagePaths: zod_1.z.array(exports.jobImagePathSchema).max(types_1.JOB_IMAGE_LIMIT).default([]),
    basePayPaise: exports.basePayPaiseSchema,
})
    .superRefine((value, ctx) => {
    if (value.skillSlug === types_1.OTHER_SKILL_SLUG && !value.customSkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Tell us what you need done.',
            path: ['customSkill'],
        });
    }
    if (value.skillSlug !== types_1.OTHER_SKILL_SLUG && value.customSkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Only the "Other" category takes a custom skill.',
            path: ['customSkill'],
        });
    }
    const hasLat = value.latitude !== undefined;
    const hasLon = value.longitude !== undefined;
    if (hasLat !== hasLon) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Latitude and longitude must be provided together.',
            path: hasLat ? ['longitude'] : ['latitude'],
        });
    }
});
/** The on-site stages an assigned pro drives a confirmed job through. */
exports.JOB_ACTIONS = ['travel', 'arrived', 'start', 'complete'];
/**
 * Moves a confirmed job through one on-site stage.
 *
 * The `arrived` action requires the pro's live position so the server can
 * verify they are actually at the work spot before they claim arrival; the
 * other actions do not send coordinates. Validation here stays permissive
 * (coordinates optional) — the proximity rule is enforced authoritatively in
 * the jobs service.
 */
exports.transitionJobSchema = zod_1.z.object({
    action: zod_1.z.enum(exports.JOB_ACTIONS),
    /** Optional context, e.g. a note to the customer. */
    note: zod_1.z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
    /** The pro's live position, required by the server for the `arrived` action. */
    coordinates: primitives_1.coordinatesSchema.optional(),
});
/**
 * Verifies a pro's claim to start work using the one-time code the customer
 * holds.
 *
 * The code is 4 digits, issued once per job and entered by the pro from what
 * the customer reads out. The server compares it in constant time and counts
 * failures so a wrong code cannot be sprayed (server-side brute-force guard).
 */
exports.verifyStartSchema = zod_1.z.object({
    action: zod_1.z.literal('start'),
    code: zod_1.z.string().regex(/^\d{4}$/, 'Enter the 4-digit code you got from the customer.'),
});
/** Optional context for a cancellation; never loaded with meaning. */
exports.cancelJobSchema = zod_1.z.object({
    note: zod_1.z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
});
/** List of a caller's own jobs, optionally filtered by one status. */
exports.jobListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(jobStatusOptions).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(50).optional(),
});
/**
 * Reads `status` as either a comma-separated list or repeated query keys — the
 * two shapes the admin dashboard and ad-hoc API clients naturally send.
 */
function statusListQuery(options) {
    return zod_1.z.preprocess((value) => {
        if (value === undefined || value === '')
            return undefined;
        const values = Array.isArray(value) ? value : [value];
        return values.flatMap((entry) => typeof entry === 'string' ? entry.split(',').filter(Boolean) : [entry]);
    }, zod_1.z.array(zod_1.z.enum(options)).optional());
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
];
const liveJobStatusListQuery = statusListQuery(liveJobStatusOptions);
/** How the live board orders today's rows. */
exports.ADMIN_LIVE_SORTS = ['newest', 'oldest', 'amount_desc', 'expiring'];
/**
 * Filters for the admin live board: today's still-open jobs only.
 *
 * There is no cursor or date range — the server pins the window to the current
 * day in the operations time zone and returns the whole (bounded) snapshot.
 */
exports.adminLiveQuerySchema = zod_1.z.object({
    status: liveJobStatusListQuery,
    sort: zod_1.z.enum(exports.ADMIN_LIVE_SORTS).default('newest'),
    q: zod_1.z.string().trim().max(80, 'Keep the search under 80 characters.').optional(),
});
/**
 * Filters for the admin bookings ledger.
 *
 * This is the read-only history of every job — including settled and cancelled
 * ones — unlike `jobListQuerySchema`, which only ever filters one caller's own
 * jobs. `cursor` is opaque to the client; the server encodes the last row's
 * `createdAt` + `id` so pages stay stable while new jobs are written.
 */
exports.adminJobListQuerySchema = primitives_1.paginationSchema
    .extend({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    status: jobStatusListQuery,
    from: zod_1.z.iso.datetime({ offset: true }).optional(),
    to: zod_1.z.iso.datetime({ offset: true }).optional(),
    serviceId: primitives_1.idSchema.optional(),
    proId: primitives_1.idSchema.optional(),
    customerId: primitives_1.idSchema.optional(),
    q: zod_1.z.string().trim().max(80, 'Keep the search under 80 characters.').optional(),
})
    .refine((value) => value.from === undefined ||
    value.to === undefined ||
    new Date(value.to).getTime() > new Date(value.from).getTime(), { message: '`to` must be after `from`.', path: ['to'] });
/**
 * The signed, single-use offer token delivered inside a job alert's FCM data.
 *
 * Redeemable (Accept/Reject) only by native code that holds both this token and
 * the device it was minted for. The server verifies the signature, expiry and
 * device binding, then consumes it atomically so no token can be replayed.
 */
exports.jobOfferTokenSchema = zod_1.z
    .string()
    .min(1, 'Offer token is required.')
    .max(1024, 'Offer token is invalid.');
/**
 * A per-install device identifier, minted by the Android job-alert module and
 * registered with the push token. Binds every minted offer to one device.
 */
exports.deviceIdSchema = zod_1.z
    .string()
    .min(8, 'Device id is invalid.')
    .max(128, 'Device id is invalid.');
/** Redeems a job-offer token by accepting the job. */
exports.acceptJobOfferSchema = zod_1.z.object({
    offerToken: exports.jobOfferTokenSchema,
    deviceId: exports.deviceIdSchema,
});
/** Redeems a job-offer token by declining (rejecting) the job. */
exports.rejectJobOfferSchema = zod_1.z.object({
    offerToken: exports.jobOfferTokenSchema,
    deviceId: exports.deviceIdSchema,
});
//# sourceMappingURL=job.js.map