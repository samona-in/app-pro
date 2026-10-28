import { z } from 'zod';
export declare const idSchema: z.ZodUUID;
/** Machine name like `electrical-socket-switch-installation`. */
export declare const slugSchema: z.ZodString;
export declare const emailSchema: z.ZodEmail;
/** E.164, e.g. +919876543210. Storing a normalised form keeps lookups simple. */
export declare const phoneSchema: z.ZodString;
export declare const fullNameSchema: z.ZodString;
export declare const latitudeSchema: z.ZodNumber;
export declare const longitudeSchema: z.ZodNumber;
export declare const coordinatesSchema: z.ZodObject<{
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
}, z.core.$strip>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
/** Cursor pagination shared by list endpoints. */
export declare const paginationSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PaginationInput = z.infer<typeof paginationSchema>;
//# sourceMappingURL=primitives.d.ts.map