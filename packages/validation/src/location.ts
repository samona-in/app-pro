import { z } from 'zod';

/**
 * Geocoding query schemas for the `/locations` proxy.
 *
 * The server proxies Google (Places API v1 + the Geocoding API) so the client
 * never talks to a third party directly and the provider can be swapped without
 * an app release. Coordinates come from the query string, so they are coerced
 * from strings before the range check.
 */
export const addressSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Type at least 2 characters to search.')
    .max(120, 'Search is too long.'),
  limit: z.coerce.number().int().min(1).max(10).default(6),
});

export const reverseGeocodeQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

/** Path param for resolving a stored place id back into a suggestion. */
export const placeDetailsParamsSchema = z.object({
  placeId: z.string().trim().min(1).max(512),
});