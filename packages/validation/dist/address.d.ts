import { z } from 'zod';
/**
 * Saved-address input schemas for `/addresses`, shared by the Customer app and
 * the API. `coordinatesSchema` reuses the shared lat/long primitives.
 */
export declare const addressLabelSchema: z.ZodEnum<{
    HOME: "HOME";
    WORK: "WORK";
    OTHER: "OTHER";
}>;
export declare const savedAddressCreateSchema: z.ZodObject<{
    name: z.ZodString;
    label: z.ZodEnum<{
        HOME: "HOME";
        WORK: "WORK";
        OTHER: "OTHER";
    }>;
    addressLine1: z.ZodString;
    addressLine2: z.ZodOptional<z.ZodString>;
    landmark: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodOptional<z.ZodString>;
    coordinates: z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>;
    placeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type SavedAddressCreateInput = z.infer<typeof savedAddressCreateSchema>;
export declare const savedAddressUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodEnum<{
        HOME: "HOME";
        WORK: "WORK";
        OTHER: "OTHER";
    }>>;
    addressLine1: z.ZodOptional<z.ZodString>;
    addressLine2: z.ZodOptional<z.ZodString>;
    landmark: z.ZodOptional<z.ZodString>;
    locality: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodOptional<z.ZodString>;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    placeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type SavedAddressUpdateInput = z.infer<typeof savedAddressUpdateSchema>;
//# sourceMappingURL=address.d.ts.map