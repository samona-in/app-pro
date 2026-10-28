"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableJobsQuerySchema = exports.proOffersQuerySchema = exports.proJobsQuerySchema = exports.customerRequestsQuerySchema = exports.maxInterestedPros = exports.confirmPaymentSchema = exports.jobTransitionSchema = exports.availabilityPatchSchema = exports.createProInterestSchema = exports.declineOfferSchema = exports.acceptOfferSchema = exports.cancelRequestSchema = exports.selectProSchema = exports.createServiceRequestSchema = void 0;
const zod_1 = require("zod");
const config_1 = require("@samona/config");
const types_1 = require("@samona/types");
const files_1 = require("./files");
/**
 * Input schemas for the order-service lifecycle, shared by the apps and the
 * API (architecture §29). Server-side validation is authoritative; the app's
 * checks are a UX convenience only.
 *
 * Server-controlled fields — status, selectedProId, finalPrice, distances —
 * are absent by construction, so a client can neither assert nor forge them.
 */
/** Values a customer may state when filing a request. */
exports.createServiceRequestSchema = zod_1.z.object({
    serviceId: zod_1.z.uuid({ message: 'Choose a service.' }),
    description: zod_1.z
        .string()
        .trim()
        .max(2000, 'Keep the description under 2000 characters.')
        .optional(),
    photos: zod_1.z
        .array(files_1.photoUrlSchema)
        .max(8, 'Attach at most 8 photos.')
        .optional(),
    latitude: zod_1.z.number().min(-90).max(90).optional(),
    longitude: zod_1.z.number().min(-180).max(180).optional(),
    address: zod_1.z.string().trim().max(300, 'Address must be 300 characters or fewer.').optional(),
    /** V1 quote anchor in rupees. Optional; not a price anyone can change later. */
    estimatedPrice: zod_1.z.number().int().min(0).max(10_000_000).optional(),
});
/** Identifies one responder from the customer's shortlist. */
exports.selectProSchema = zod_1.z.object({
    respondType: zod_1.z.enum(['offer', 'interest'], { message: 'Pick a valid responder.' }),
    responderId: zod_1.z.uuid({ message: 'Pick a valid professional.' }),
});
/** Cancelling a request carries no fields; who may cancel is a server rule. */
exports.cancelRequestSchema = zod_1.z.strictObject({});
exports.acceptOfferSchema = zod_1.z.strictObject({});
exports.declineOfferSchema = zod_1.z.strictObject({});
/** A pro expressing interest in an open request. */
exports.createProInterestSchema = zod_1.z.object({
    serviceRequestId: zod_1.z.uuid(),
});
/**
 * The pro's online/offline switch.
 *
 * Coming online in earnest requires coordinates — the marketplace cannot match
 * a pro whose location is unknown. Going offline never needs them.
 */
exports.availabilityPatchSchema = zod_1.z
    .object({
    isOnline: zod_1.z.boolean(),
    coordinates: zod_1.z
        .object({ latitude: zod_1.z.number().min(-90).max(90), longitude: zod_1.z.number().min(-180).max(180) })
        .optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
})
    .superRefine((value, ctx) => {
    if (value.isOnline && !value.coordinates) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['coordinates'],
            message: 'Going online requires your current location.',
        });
    }
});
/** On-site job transitions; a note is optional context, never historical truth. */
exports.jobTransitionSchema = zod_1.z.object({
    note: zod_1.z.string().trim().max(300).optional(),
});
/** Marking a completed job paid carries no fields for V1. */
exports.confirmPaymentSchema = zod_1.z.strictObject({});
/**
 * Limits an open job's interest list because dispatch batches share a ceiling
 * too — the two markets must not disagree about how many pros a request can
 * realistically see.
 */
exports.maxInterestedPros = config_1.ORDER_LIFECYCLE.maxInterestedPros;
// ---------------------------------------------------------------------------
// Query parameters. URL query strings arrive as text, so numbers are coerced.
// ---------------------------------------------------------------------------
const limitSchema = zod_1.z.coerce.number().int().min(1).max(100).optional();
const offsetSchema = zod_1.z.coerce.number().int().min(0).max(5000).optional();
exports.customerRequestsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(types_1.SERVICE_REQUEST_STATUSES).optional(),
    limit: limitSchema,
    offset: offsetSchema,
});
exports.proJobsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(types_1.SERVICE_REQUEST_STATUSES).optional(),
    limit: limitSchema,
});
exports.proOffersQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(types_1.JOB_OFFER_STATUSES).optional(),
    limit: limitSchema,
});
exports.availableJobsQuerySchema = zod_1.z.object({
    serviceId: zod_1.z.uuid().optional(),
    limit: limitSchema,
    offset: offsetSchema,
});
//# sourceMappingURL=order.js.map