"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarCompleteSchema = exports.customerLocationPatchSchema = exports.customerOnboardingPatchSchema = exports.customerOnboardingAddressSchema = exports.customerOnboardingGenderSchema = exports.customerOnboardingNameSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("./constants");
const primitives_1 = require("./primitives");
const pro_1 = require("./pro");
/**
 * Customer onboarding input schemas, shared by the app and the API.
 *
 * Each step submits only its own fields so progress is saved incrementally.
 */
exports.customerOnboardingNameSchema = zod_1.z.object({
    displayName: pro_1.displayNameSchema,
});
exports.customerOnboardingGenderSchema = zod_1.z.object({
    gender: zod_1.z.enum(constants_1.GENDER_VALUES),
});
exports.customerOnboardingAddressSchema = zod_1.z.object({
    coordinates: primitives_1.coordinatesSchema.optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
});
/**
 * Any single customer onboarding step.
 *
 * A partial update: only the keys present are written.
 */
exports.customerOnboardingPatchSchema = zod_1.z
    .object({
    displayName: pro_1.displayNameSchema.optional(),
    gender: zod_1.z.enum(constants_1.GENDER_VALUES).optional(),
    coordinates: primitives_1.coordinatesSchema.optional(),
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
    avatarUrl: zod_1.z.url().optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
});
/**
 * Where the customer is right now, sent by the app from the device's fix.
 *
 * Coordinates are the location and are always required. The label and its
 * durable place id ride along only when the geocoder resolved them — a
 * reverse lookup that failed must not cost the customer their position, and
 * must not blank the label the profile already carries.
 */
exports.customerLocationPatchSchema = zod_1.z.object({
    coordinates: primitives_1.coordinatesSchema,
    locationLabel: zod_1.z.string().trim().max(120).optional(),
    /** Durable place id for the label, so it can be re-resolved on read. */
    locationPlaceId: zod_1.z.string().trim().max(512).nullable().optional(),
});
/**
 * Step 3 of the avatar upload handshake.
 *
 * The client sends back the object path the API minted in step 1. The server
 * still owns the real check — the path must sit under the caller's own id and
 * its own surface — but the schema bounds its shape up-front so foreign paths
 * never reach the storage layer.
 */
exports.avatarCompleteSchema = zod_1.z.strictObject({
    path: zod_1.z
        .string()
        .trim()
        .min(1)
        .max(300)
        .regex(/^customers\/[^/]+\/avatar-[^/]+\.jpg$/i, 'The photo path is not valid.'),
});
//# sourceMappingURL=customer.js.map