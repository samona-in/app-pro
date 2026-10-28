import { z } from 'zod';
/**
 * Input schemas for the order-service lifecycle, shared by the apps and the
 * API (architecture §29). Server-side validation is authoritative; the app's
 * checks are a UX convenience only.
 *
 * Server-controlled fields — status, selectedProId, finalPrice, distances —
 * are absent by construction, so a client can neither assert nor forge them.
 */
/** Values a customer may state when filing a request. */
export declare const createServiceRequestSchema: z.ZodObject<{
    serviceId: z.ZodUUID;
    description: z.ZodOptional<z.ZodString>;
    photos: z.ZodOptional<z.ZodArray<z.ZodURL>>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodString>;
    estimatedPrice: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
/** Identifies one responder from the customer's shortlist. */
export declare const selectProSchema: z.ZodObject<{
    respondType: z.ZodEnum<{
        offer: "offer";
        interest: "interest";
    }>;
    responderId: z.ZodUUID;
}, z.core.$strip>;
export type SelectProInput = z.infer<typeof selectProSchema>;
/** Cancelling a request carries no fields; who may cancel is a server rule. */
export declare const cancelRequestSchema: z.ZodObject<{}, z.core.$strict>;
export declare const acceptOfferSchema: z.ZodObject<{}, z.core.$strict>;
export declare const declineOfferSchema: z.ZodObject<{}, z.core.$strict>;
/** A pro expressing interest in an open request. */
export declare const createProInterestSchema: z.ZodObject<{
    serviceRequestId: z.ZodUUID;
}, z.core.$strip>;
export type CreateProInterestInput = z.infer<typeof createProInterestSchema>;
/**
 * The pro's online/offline switch.
 *
 * Coming online in earnest requires coordinates — the marketplace cannot match
 * a pro whose location is unknown. Going offline never needs them.
 */
export declare const availabilityPatchSchema: z.ZodObject<{
    isOnline: z.ZodBoolean;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AvailabilityPatchInput = z.infer<typeof availabilityPatchSchema>;
/** On-site job transitions; a note is optional context, never historical truth. */
export declare const jobTransitionSchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type JobTransitionInput = z.infer<typeof jobTransitionSchema>;
/** Marking a completed job paid carries no fields for V1. */
export declare const confirmPaymentSchema: z.ZodObject<{}, z.core.$strict>;
/**
 * Limits an open job's interest list because dispatch batches share a ceiling
 * too — the two markets must not disagree about how many pros a request can
 * realistically see.
 */
export declare const maxInterestedPros: 5;
export declare const customerRequestsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        REQUESTED: "REQUESTED";
        DISPATCHING: "DISPATCHING";
        CHOOSING_PRO: "CHOOSING_PRO";
        OPEN: "OPEN";
        CONFIRMED: "CONFIRMED";
        TRAVELLING: "TRAVELLING";
        ARRIVED: "ARRIVED";
        IN_PROGRESS: "IN_PROGRESS";
        COMPLETED: "COMPLETED";
        PAID: "PAID";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const proJobsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        REQUESTED: "REQUESTED";
        DISPATCHING: "DISPATCHING";
        CHOOSING_PRO: "CHOOSING_PRO";
        OPEN: "OPEN";
        CONFIRMED: "CONFIRMED";
        TRAVELLING: "TRAVELLING";
        ARRIVED: "ARRIVED";
        IN_PROGRESS: "IN_PROGRESS";
        COMPLETED: "COMPLETED";
        PAID: "PAID";
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
    }>>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const proOffersQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        CANCELLED: "CANCELLED";
        EXPIRED: "EXPIRED";
        OFFERED: "OFFERED";
        ACCEPTED: "ACCEPTED";
        SELECTED: "SELECTED";
        DECLINED: "DECLINED";
    }>>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const availableJobsQuerySchema: z.ZodObject<{
    serviceId: z.ZodOptional<z.ZodUUID>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
//# sourceMappingURL=order.d.ts.map