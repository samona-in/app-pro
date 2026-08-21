import type { PrismaClient } from '../database/prisma';

export interface UsersServiceDeps {
  prisma: PrismaClient;
}

/**
 * Users domain service.
 *
 * Owns the shared `User` record and role assignment — the identity every
 * other profile hangs off.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createUsersService(deps: UsersServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type UsersService = ReturnType<typeof createUsersService>;
