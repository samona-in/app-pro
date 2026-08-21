import { z } from 'zod';
import { USER_ROLES } from '@samona/types';
import { emailSchema, fullNameSchema, phoneSchema } from './primitives';

/**
 * Role is validated here so the *shape* is well-formed, but a client-supplied
 * role is never trusted for authorisation — the server derives the effective
 * role from the authenticated user (CLAUDE.md "Authentication").
 */
export const userRoleSchema = z.enum(USER_ROLES as [string, ...string[]]);

export const updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
