import { z } from 'zod';
/**
 * A surface role is validated here so the *shape* is well-formed, but a
 * client-supplied role is never trusted for authorisation — the server derives
 * the effective surface from the `X-App-Type` header and the stored `isAdmin`
 * flag (CLAUDE.md "Authentication"). Admin is not a surface; it is `isAdmin`.
 */
export declare const userRoleSchema: z.ZodEnum<{
    [x: string]: string;
}>;
export declare const updateProfileSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEmail>;
    phone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
/**
 * The single-use deletion authorization travels in the `X-Deletion-Token`
 * header so `DELETE /users/me` stays a bodyless request and the token never
 * appears in a URL or a log line. The token itself is 64 hex chars; the shape
 * only enforces a sane length, nothing about content.
 */
export declare const deletionTokenHeaderSchema: z.ZodObject<{
    'x-deletion-token': z.ZodString;
}, z.core.$strip>;
export type DeletionTokenHeader = z.infer<typeof deletionTokenHeaderSchema>;
//# sourceMappingURL=user.d.ts.map