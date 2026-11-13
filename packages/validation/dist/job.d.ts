import { z } from 'zod';
/**
 * Free-text description of the requested work.
 *
 * Optional: many customers prefer to explain the job in person, so an empty
 * description is valid. When provided it is capped at {@link JOB_DESCRIPTION_MAX}.
 */
export declare const jobDescriptionSchema: z.ZodString;
/** New-image price the customer commits to, in paise. At least ₹1. */
export declare const basePayPaiseSchema: z.ZodNumber;
/**
 * How many countable work units the customer is booking (`PER_UNIT`).
 *
 * The skill's own `minQuantity`/`maxQuantity` are enforced by the server; this
 * only rejects impossible values before the request reaches the catalogue.
 */
export declare const jobQuantitySchema: z.ZodNumber;
/**
 * How long the customer wants the work (`PER_HOUR`), in minutes.
 *
 * The skill's configured minimum, maximum and step are enforced by the server.
 */
export declare const jobDurationMinutesSchema: z.ZodNumber;
/** Optional display label for the place the work happens. */
export declare const jobLocationLabelSchema: z.ZodString;
/** A submitted storage path for one attached photo (0–5). */
export declare const jobImagePathSchema: z.ZodString;
/**
 * The free-text category next to the `other` sentinel skill. Only meaningful
 * (and only accepted) when `skillSlug` is `other` — see `createJobSchema`.
 */
export declare const customSkillSchema: z.ZodString;
/**
 * One distinct work inside a multi-work request.
 *
 * Each entry is addressed by slug (like the legacy single-work shape) and may
 * carry its own `customSkill` (only for the `other` sentinel), `quantity`
 * (`PER_UNIT` skills) and `durationMinutes` (`PER_HOUR` skills). Pricing is
 * never taken from the client — the server prices every item from the
 * catalogue.
 */
export declare const createJobItemSchema: z.ZodObject<{
    skillSlug: z.ZodString;
    customSkill: z.ZodOptional<z.ZodString>;
    quantity: z.ZodDefault<z.ZodNumber>;
    durationMinutes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
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
export declare const createJobSchema: z.ZodObject<{
    serviceSlug: z.ZodString;
    skillSlug: z.ZodOptional<z.ZodString>;
    customSkill: z.ZodOptional<z.ZodString>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        skillSlug: z.ZodString;
        customSkill: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
        durationMinutes: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    description: z.ZodDefault<z.ZodString>;
    imagePaths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    quantity: z.ZodDefault<z.ZodNumber>;
    durationMinutes: z.ZodOptional<z.ZodNumber>;
    basePayPaise: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
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
export declare const createJobGroupSchema: z.ZodObject<{
    serviceSlug: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        skillSlug: z.ZodString;
        customSkill: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
        durationMinutes: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
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
export declare const createJobBatchSchema: z.ZodObject<{
    groups: z.ZodArray<z.ZodObject<{
        serviceSlug: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            skillSlug: z.ZodString;
            customSkill: z.ZodOptional<z.ZodString>;
            quantity: z.ZodDefault<z.ZodNumber>;
            durationMinutes: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    description: z.ZodDefault<z.ZodString>;
    imagePaths: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CreateJobBatchInput = z.infer<typeof createJobBatchSchema>;
export type CreateJobBatchRequest = z.input<typeof createJobBatchSchema>;
/** The on-site stages an assigned pro drives a confirmed job through. */
export declare const JOB_ACTIONS: readonly ["travel", "arrived", "start", "complete"];
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
export declare const transitionJobSchema: z.ZodObject<{
    action: z.ZodEnum<{
        travel: "travel";
        arrived: "arrived";
        start: "start";
        complete: "complete";
    }>;
    note: z.ZodOptional<z.ZodString>;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TransitionJobInput = z.infer<typeof transitionJobSchema>;
/**
 * Verifies a pro's claim to start work using the one-time code the customer
 * holds.
 *
 * The code is 4 digits, issued once per job and entered by the pro from what
 * the customer reads out. The server compares it in constant time and counts
 * failures so a wrong code cannot be sprayed (server-side brute-force guard).
 */
export declare const verifyStartSchema: z.ZodObject<{
    action: z.ZodLiteral<"start">;
    code: z.ZodString;
}, z.core.$strip>;
export type VerifyStartInput = z.infer<typeof verifyStartSchema>;
/** Optional context for a cancellation; never loaded with meaning. */
export declare const cancelJobSchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CancelJobInput = z.infer<typeof cancelJobSchema>;
/** List of a caller's own jobs, optionally filtered by one status. */
export declare const jobListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        REQUESTED: "REQUESTED";
        OFFERED: "OFFERED";
        ACCEPTED: "ACCEPTED";
        TRAVELLING: "TRAVELLING";
        ARRIVED: "ARRIVED";
        IN_PROGRESS: "IN_PROGRESS";
        COMPLETED: "COMPLETED";
        PAYMENT_PENDING: "PAYMENT_PENDING";
        PAID: "PAID";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
/** How the live board orders today's rows. */
export declare const ADMIN_LIVE_SORTS: readonly ["newest", "oldest", "amount_desc", "expiring"];
export type AdminLiveSort = (typeof ADMIN_LIVE_SORTS)[number];
/**
 * Filters for the admin live board: today's still-open jobs only.
 *
 * There is no cursor or date range — the server pins the window to the current
 * day in the operations time zone and returns the whole (bounded) snapshot.
 */
export declare const adminLiveQuerySchema: z.ZodObject<{
    status: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodEnum<{
        REQUESTED: "REQUESTED";
        OFFERED: "OFFERED";
        ACCEPTED: "ACCEPTED";
        TRAVELLING: "TRAVELLING";
        ARRIVED: "ARRIVED";
        IN_PROGRESS: "IN_PROGRESS";
        COMPLETED: "COMPLETED";
        PAYMENT_PENDING: "PAYMENT_PENDING";
    }>>>, unknown>;
    sort: z.ZodDefault<z.ZodEnum<{
        newest: "newest";
        oldest: "oldest";
        amount_desc: "amount_desc";
        expiring: "expiring";
    }>>;
    q: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AdminLiveQuery = z.infer<typeof adminLiveQuerySchema>;
/**
 * Filters for the admin bookings ledger.
 *
 * This is the read-only history of every job — including settled and cancelled
 * ones — unlike `jobListQuerySchema`, which only ever filters one caller's own
 * jobs. `cursor` is opaque to the client; the server encodes the last row's
 * `createdAt` + `id` so pages stay stable while new jobs are written.
 */
export declare const adminJobListQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    status: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodEnum<{
        REQUESTED: "REQUESTED";
        OFFERED: "OFFERED";
        ACCEPTED: "ACCEPTED";
        TRAVELLING: "TRAVELLING";
        ARRIVED: "ARRIVED";
        IN_PROGRESS: "IN_PROGRESS";
        COMPLETED: "COMPLETED";
        PAYMENT_PENDING: "PAYMENT_PENDING";
        PAID: "PAID";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>>, unknown>;
    from: z.ZodOptional<z.ZodISODateTime>;
    to: z.ZodOptional<z.ZodISODateTime>;
    serviceId: z.ZodOptional<z.ZodUUID>;
    proId: z.ZodOptional<z.ZodUUID>;
    customerId: z.ZodOptional<z.ZodUUID>;
    q: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AdminJobListQuery = z.infer<typeof adminJobListQuerySchema>;
/**
 * The signed, single-use offer token delivered inside a job alert's FCM data.
 *
 * Redeemable (Accept/Reject) only by native code that holds both this token and
 * the device it was minted for. The server verifies the signature, expiry and
 * device binding, then consumes it atomically so no token can be replayed.
 */
export declare const jobOfferTokenSchema: z.ZodString;
/**
 * A per-install device identifier, minted by the Android job-alert module and
 * registered with the push token. Binds every minted offer to one device.
 */
export declare const deviceIdSchema: z.ZodString;
/** Redeems a job-offer token by accepting the job. */
export declare const acceptJobOfferSchema: z.ZodObject<{
    offerToken: z.ZodString;
    deviceId: z.ZodString;
}, z.core.$strip>;
export type AcceptJobOfferInput = z.infer<typeof acceptJobOfferSchema>;
/** Redeems a job-offer token by declining (rejecting) the job. */
export declare const rejectJobOfferSchema: z.ZodObject<{
    offerToken: z.ZodString;
    deviceId: z.ZodString;
}, z.core.$strip>;
export type RejectJobOfferInput = z.infer<typeof rejectJobOfferSchema>;
//# sourceMappingURL=job.d.ts.map