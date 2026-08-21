import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@samona/types';

export const ROLES_KEY = 'samona:roles';

/**
 * Restricts a route to the given roles.
 *
 * Authorisation is decided here on the server from the authenticated user's
 * role — never from a role supplied by the client (CLAUDE.md "Authentication").
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
