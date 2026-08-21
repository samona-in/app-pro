import type { PrismaClient } from '../database/prisma';

export interface NotificationsServiceDeps {
  prisma: PrismaClient;
}

/**
 * Notifications domain service.
 *
 * Push tokens, delivery and notification history via Expo Notifications.
 *
 * Scaffold only — no behaviour is implemented yet. Methods go on the returned
 * object and read their dependencies from the enclosing scope.
 */
export function createNotificationsService(deps: NotificationsServiceDeps) {
  // Captured for the methods this service will expose.
  void deps;

  return {};
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
