import { z } from 'zod';
/**
 * Geocoding query schemas for the `/locations` proxy.
 *
 * The server proxies Google (Places API v1 + the Geocoding API) so the client
 * never talks to a third party directly and the provider can be swapped without
 * an app release. Coordinates come from the query string, so they are coerced
 * from strings before the range check.
 */
export declare const addressSearchQuerySchema: z.ZodObject<{
    q: z.ZodString;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const reverseGeocodeQuerySchema: z.ZodObject<{
    latitude: z.ZodCoercedNumber<unknown>;
    longitude: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
/** Path param for resolving a stored place id back into a suggestion. */
export declare const placeDetailsParamsSchema: z.ZodObject<{
    placeId: z.ZodString;
}, z.core.$strip>;
//# sourceMappingURL=location.d.ts.map