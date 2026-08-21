import type { PrismaClient } from '../database/prisma';

/**
 * Notifications domain service.
 *
 * Push tokens, delivery and notification history via Expo Notifications.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}
}
