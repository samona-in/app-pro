"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectJobOfferSchema = exports.acceptJobOfferSchema = exports.deviceIdSchema = exports.jobOfferTokenSchema = exports.adminJobListQuerySchema = exports.adminLiveQuerySchema = exports.ADMIN_LIVE_SORTS = exports.jobListQuerySchema = exports.cancelJobSchema = exports.verifyStartSchema = exports.transitionJobSchema = exports.JOB_ACTIONS = exports.createJobBatchSchema = exports.createJobGroupSchema = exports.createJobSchema = exports.createJobItemSchema = exports.customSkillSchema = exports.jobImagePathSchema = exports.jobLocationLabelSchema = exports.jobDurationMinutesSchema = exports.jobQuantitySchema = exports.basePayPaiseSchema = exports.jobDescriptionSchema = void 0;
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
/**
 * How many countable work units the customer is booking (`PER_UNIT`).
 *
 * The skill's own `minQuantity`/`maxQuantity` are enforced by the server; this
 * only rejects impossible values before the request reaches the catalogue.
 */
exports.jobQuantitySchema = zod_1.z
    .number()
    .int('Quantity must be a whole number.')
    .min(1, 'Book at least one unit.')
    .max(1_000, 'That quantity is too large.');
/**
 * How long the customer wants the work (`PER_HOUR`), in minutes.
 *
 * The skill's configured minimum, maximum and step are enforced by the server.
 */
exports.jobDurationMinutesSchema = zod_1.z
    .number()
    .int('Duration must be a whole number of minutes.')
    .min(1, 'Book at least one minute.')
    .max(24 * 60, 'That duration is too long.');
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
 * One distinct work inside a multi-work request.
 *
 * Each entry is addressed by slug (like the legacy single-work shape) and may
 * carry its own `customSkill` (only for the `other` sentinel), `quantity`
 * (`PER_UNIT` skills) and `durationMinutes` (`PER_HOUR` skills). Pricing is
 * never taken from the client — the server prices every item from the
 * catalogue.
 */
exports.createJobItemSchema = zod_1.z
    .object({
    skillSlug: primitives_1.slugSchema,
    customSkill: exports.customSkillSchema.optional(),
    /** Work units for `PER_UNIT` skills; ignored for the other models. */
    quantity: exports.jobQuantitySchema.default(1),
    /** Duration in minutes for `PER_HOUR` skills; ignored otherwise. */
    durationMinutes: exports.jobDurationMinutesSchema.optional(),
})
    .superRefine((item, ctx) => {
    if (item.skillSlug === types_1.OTHER_SKILL_SLUG && !item.customSkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Tell us what you need done.',
            path: ['customSkill'],
        });
    }
    if (item.skillSlug !== types_1.OTHER_SKILL_SLUG && item.customSkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Only the "Other" category takes a custom skill.',
            path: ['customSkill'],
        });
    }
});
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
exports.createJobSchema = zod_1.z
    .object({
    serviceSlug: primitives_1.slugSchema,
    /** The single work (legacy shape). Mutually exclusive with `items`. */
    skillSlug: primitives_1.slugSchema.optional(),
    /** The free-text category for the `other` sentinel (legacy shape). */
    customSkill: exports.customSkillSchema.optional(),
    /**
     * The distinct works in this request (multi-work shape). 1 entry keeps the
     * order SINGLE; 2 or more make it BULK. Mutually exclusive with
     * `skillSlug`.
     */
    items: zod_1.z.array(exports.createJobItemSchema).min(1).max(types_1.JOB_ITEMS_LIMIT).optional(),
    // The work location, snapshotted onto the job at creation (CLAUDE "jobs"
    // location snapshot). Coordinates come as a pair; the server falls back to
    // the customer profile's saved location when none is submitted.
    locationLabel: exports.jobLocationLabelSchema.optional(),
    latitude: primitives_1.latitudeSchema.optional(),
    longitude: primitives_1.longitudeSchema.optional(),
    description: exports.jobDescriptionSchema.default(''),
    imagePaths: zod_1.z.array(exports.jobImagePathSchema).max(types_1.JOB_IMAGE_LIMIT).default([]),
    /** Work units for the single `PER_UNIT` work (legacy shape). */
    quantity: exports.jobQuantitySchema.default(1),
    /** Duration in minutes for the single `PER_HOUR` work (legacy shape). */
    durationMinutes: exports.jobDurationMinutesSchema.optional(),
    /**
     * Legacy field. The server computes the total from the catalogue, so this
     * is accepted (older clients still send it) but never written.
     */
    basePayPaise: exports.basePayPaiseSchema.optional(),
})
    .superRefine((value, ctx) => {
    // Exactly one addressing shape: the legacy single work or the item list.
    // A mixed request is ambiguous (which quantity belongs to which work?) so
    // it is rejected rather than guessed at.
    const hasItems = value.items !== undefined;
    const hasLegacySkill = value.skillSlug !== undefined;
    if (hasItems && hasLegacySkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Send either one work or a list of works, not both.',
            path: ['items'],
        });
    }
    if (!hasItems && !hasLegacySkill) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Choose at least one work.',
            path: ['skillSlug'],
        });
    }
    // Legacy single-work rules — mirrored per item in `createJobItemSchema`.
    if (hasLegacySkill) {
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
    }
    // A multi-work request lists distinct works: the same work may not appear
    // twice (its quantity belongs on one entry).
    const items = value.items;
    if (items) {
        const seen = new Set();
        for (const [index, item] of items.entries()) {
            if (seen.has(item.skillSlug)) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
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
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Latitude and longitude must be provided together.',
            path: hasLat ? ['longitude'] : ['latitude'],
        });
    }
});
/**
 * One service's slice of a multi-service checkout.
 *
 * Works are addressed by slug exactly like a single-service request; the server
 * resolves them to ids and confirms every one belongs to this service. Two or
 * more works make this service's job BULK; one keeps it SINGLE.
 */
exports.createJobGroupSchema = zod_1.z
    .object({
    serviceSlug: primitives_1.slugSchema,
    items: zod_1.z.array(exports.createJobItemSchema).min(1).max(types_1.JOB_ITEMS_LIMIT),
})
    .superRefine((group, ctx) => {
    // Distinct works per service: a work's quantity belongs on one entry.
    const seen = new Set();
    for (const [index, item] of group.items.entries()) {
        if (seen.has(item.skillSlug)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'Each work may appear only once — change its quantity instead.',
                path: ['items', index, 'skillSlug'],
            });
        }
        seen.add(item.skillSlug);
    }
});
/**
 * Places one checkout that may span several services.
 *
 * Each group becomes its own job (own pro, lifecycle, OTP, chat, cash payment)
 * and all jobs share a server-generated `orderGroupId`. Notes, photos and the
 * work location are shared by the whole checkout: it is one visit, even when
 * several trades are needed. Services and works are addressed by slug; every
 * price is derived from the catalogue server-side.
 */
exports.createJobBatchSchema = zod_1.z
    .object({
    groups: zod_1.z.array(exports.createJobGroupSchema).min(1).max(types_1.ORDER_GROUP_SERVICES_LIMIT),
    locationLabel: exports.jobLocationLabelSchema.optional(),
    latitude: primitives_1.latitudeSchema.optional(),
    longitude: primitives_1.longitudeSchema.optional(),
    description: exports.jobDescriptionSchema.default(''),
    imagePaths: zod_1.z.array(exports.jobImagePathSchema).max(types_1.JOB_IMAGE_LIMIT).default([]),
})
    .superRefine((value, ctx) => {
    // One group per service: two groups for the same service would create two
    // jobs competing for the same pros, which the cart never means.
    const seen = new Set();
    for (const [index, group] of value.groups.entries()) {
        if (seen.has(group.serviceSlug)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
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