import type { PrismaClient } from '../database/prisma';

export interface AuthServiceDeps {
  prisma: PrismaClient;
}

/**
 * Auth domain service.
 *
 * Issues and refreshes tokens for every SAMONA surface (Customer, Pro,
 * Admin). One authentication system serves all three; the role travels in
 * the verified token and is never accepted from the client.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createAuthService(deps: AuthServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type AuthService = ReturnType<typeof createAuthService>;
