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
    return deps.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Changes a user's role.
   *
   * Intentionally not reachable from any route yet: role changes are an
   * administrative action and must sit behind `requireRole('ADMIN')` once the
   * admin surface exists.
   */
  async function setRole(id: string, role: 'CUSTOMER' | 'PRO' | 'ADMIN') {
    return deps.prisma.user.update({ where: { id }, data: { role } });
  }

  return { findById, setRole };
}

export type UsersService = ReturnType<typeof createUsersService>;
