"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeDetailsParamsSchema = exports.reverseGeocodeQuerySchema = exports.addressSearchQuerySchema = void 0;
const zod_1 = require("zod");
/**
 * Geocoding query schemas for the `/locations` proxy.
 *
 * The server proxies Google (Places API v1 + the Geocoding API) so the client
 * never talks to a third party directly and the provider can be swapped without
 * an app release. Coordinates come from the query string, so they are coerced
 * from strings before the range check.
 */
exports.addressSearchQuerySchema = zod_1.z.object({
    q: zod_1.z
        .string()
        .trim()
        .min(2, 'Type at least 2 characters to search.')
        .max(120, 'Search is too long.'),
    limit: zod_1.z.coerce.number().int().min(1).max(10).default(6),
});
exports.reverseGeocodeQuerySchema = zod_1.z.object({
    latitude: zod_1.z.coerce.number().min(-90).max(90),
    longitude: zod_1.z.coerce.number().min(-180).max(180),
});
/** Path param for resolving a stored place id back into a suggestion. */
exports.placeDetailsParamsSchema = zod_1.z.object({
    placeId: zod_1.z.string().trim().min(1).max(512),
});
//# sourceMappingURL=location.js.map