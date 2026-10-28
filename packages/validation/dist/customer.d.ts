import { z } from 'zod';
/**
 * Customer onboarding input schemas, shared by the app and the API.
 *
 * Each step submits only its own fields so progress is saved incrementally.
 */
export declare const customerOnboardingNameSchema: z.ZodObject<{
    displayName: z.ZodString;
}, z.core.$strip>;
export declare const customerOnboardingGenderSchema: z.ZodObject<{
    gender: z.ZodEnum<{
        OTHER: "OTHER";
        MALE: "MALE";
        FEMALE: "FEMALE";
    }>;
}, z.core.$strip>;
export declare const customerOnboardingAddressSchema: z.ZodObject<{
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
/**
 * Any single customer onboarding step.
 *
 * A partial update: only the keys present are written.
 */
export declare const customerOnboardingPatchSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
    gender: z.ZodOptional<z.ZodEnum<{
        OTHER: "OTHER";
        MALE: "MALE";
        FEMALE: "FEMALE";
    }>>;
    coordinates: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatarUrl: z.ZodOptional<z.ZodURL>;
}, z.core.$strip>;
export type CustomerOnboardingPatchInput = z.infer<typeof customerOnboardingPatchSchema>;
/**
 * Where the customer is right now, sent by the app from the device's fix.
 *
 * Coordinates are the location and are always required. The label and its
 * durable place id ride along only when the geocoder resolved them — a
 * reverse lookup that failed must not cost the customer their position, and
 * must not blank the label the profile already carries.
 */
export declare const customerLocationPatchSchema: z.ZodObject<{
    coordinates: z.ZodObject<{
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
    }, z.core.$strip>;
    locationLabel: z.ZodOptional<z.ZodString>;
    locationPlaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type CustomerLocationPatchInput = z.infer<typeof customerLocationPatchSchema>;
/**
 * Step 3 of the avatar upload handshake.
 *
 * The client sends back the object path the API minted in step 1. The server
 * still owns the real check — the path must sit under the caller's own id and
 * its own surface — but the schema bounds its shape up-front so foreign paths
 * never reach the storage layer.
 */
export declare const avatarCompleteSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strict>;
export type AvatarCompleteInput = z.infer<typeof avatarCompleteSchema>;
//# sourceMappingURL=customer.d.ts.map