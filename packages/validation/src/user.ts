import { z } from 'zod';
import { USER_ROLES } from '@samona/types';
import { emailSchema, fullNameSchema, phoneSchema } from './primitives';

/**
 * A surface role is validated here so the *shape* is well-formed, but a
 * client-supplied role is never trusted for authorisation — the server derives
 * the effective surface from the `X-App-Type` header and the stored `isAdmin`
 * flag (CLAUDE.md "Authentication"). Admin is not a surface; it is `isAdmin`.
 */
export const userRoleSchema = z.enum(USER_ROLES as [string, ...string[]]);

export const updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * The single-use deletion authorization travels in the `X-Deletion-Token`
 * header so `DELETE /users/me` stays a bodyless request and the token never
 * appears in a URL or a log line. The token itself is 64 hex chars; the shape
 * only enforces a sane length, nothing about content.
 */
export const deletionTokenHeaderSchema = z.object({
  'x-deletion-token': z.string().trim().min(1).max(128),
});

export type DeletionTokenHeader = z.infer<typeof deletionTokenHeaderSchema>;
