import type { PrismaClient } from '../database/prisma';

export interface UsersServiceDeps {
  prisma: PrismaClient;
}

/**
 * Users domain service.
 *
 * Owns the shared `User` record and role assignment — the identity every other
 * profile hangs off. Supabase Auth owns credentials; this owns everything else.
 */
export function createUsersService(deps: UsersServiceDeps) {
  async function findById(id: string) {
    return deps.prisma.profile.findUnique({ where: { id } });
  }

  /**
   * Grants or revokes the stored admin privilege.
   *
   * Intentionally not reachable from any route yet: admin changes are an
   * administrative action and must sit behind `requireRole(...)`/`isAdmin`
   * once the admin surface exists. `isAdmin` is never read from a token.
   */
  async function setIsAdmin(id: string, isAdmin: boolean) {
    return deps.prisma.profile.update({ where: { id }, data: { isAdmin } });
  }

  return { findById, setIsAdmin };
}

export type UsersService = ReturnType<typeof createUsersService>;
