"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savedAddressUpdateSchema = exports.savedAddressCreateSchema = exports.addressLabelSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("./constants");
const primitives_1 = require("./primitives");
/**
 * Saved-address input schemas for `/addresses`, shared by the Customer app and
 * the API. `coordinatesSchema` reuses the shared lat/long primitives.
 */
exports.addressLabelSchema = zod_1.z.enum(constants_1.ADDRESS_LABELS);
const optionalLine = (max) => zod_1.z.string().trim().max(max).optional();
exports.savedAddressCreateSchema = zod_1.z.object({
    /** The customer's own name for this address, e.g. "Aveen's flat". */
    name: zod_1.z.string().trim().min(1, 'Name is required.').max(40),
    label: exports.addressLabelSchema,
    addressLine1: zod_1.z.string().trim().min(1, 'Address is required.').max(160),
    addressLine2: optionalLine(160),
    landmark: optionalLine(120),
    locality: optionalLine(120),
    city: optionalLine(80),
    state: optionalLine(80),
    postalCode: optionalLine(12),
    coordinates: primitives_1.coordinatesSchema,
    /**
     * The provider's durable place id for this address, when the geocoder
     * supplied one. Stored so the display label can be re-resolved on read.
     */
    placeId: zod_1.z.string().trim().max(512).nullable().optional(),
    /** Set when this address should become the customer's default. */
    isDefault: zod_1.z.boolean().optional(),
});
exports.savedAddressUpdateSchema = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(1, 'Name is required.').max(40).optional(),
    label: exports.addressLabelSchema.optional(),
    addressLine1: zod_1.z.string().trim().min(1, 'Address is required.').max(160).optional(),
    addressLine2: optionalLine(160),
    landmark: optionalLine(120),
    locality: optionalLine(120),
    city: optionalLine(80),
    state: optionalLine(80),
    postalCode: optionalLine(12),
    coordinates: primitives_1.coordinatesSchema.optional(),
    /** Updated durable place id, when the address was re-picked. */
    placeId: zod_1.z.string().trim().max(512).nullable().optional(),
    /** Set true to make this the customer's single default address. */
    isDefault: zod_1.z.boolean().optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
});
//# sourceMappingURL=address.js.map