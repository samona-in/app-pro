import type { PrismaClient } from '../database/prisma';

/**
 * Users domain service.
 *
 * Owns the shared `User` record and role assignment — the identity every
 * other profile hangs off.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}
}
