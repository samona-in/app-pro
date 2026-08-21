import type { PrismaClient } from '../database/prisma';

export interface ProsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Pros domain service.
 *
 * Professional profiles: skills, documents, verification state and service
 * radius.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createProsService(deps: ProsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type ProsService = ReturnType<typeof createProsService>;
