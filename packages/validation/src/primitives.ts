import { z } from 'zod';

export const idSchema = z.uuid({ message: 'Must be a valid id.' });

/** Machine name like `electrical-socket-switch-installation`. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required.')
  .max(100, 'Slug is too long.')
  .regex(/^[a-z0-9-]+$/, 'Invalid slug format.');

export const emailSchema = z
  .email({ message: 'Enter a valid email address.' })
  .trim()
  .toLowerCase();

/** E.164, e.g. +919876543210. Storing a normalised form keeps lookups simple. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid phone number, including country code.');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(80, 'Name must be 80 characters or fewer.');

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const coordinatesSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export type Coordinates = z.infer<typeof coordinatesSchema>;

/** Cursor pagination shared by list endpoints. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
