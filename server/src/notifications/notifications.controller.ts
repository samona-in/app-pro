import { Controller } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * HTTP surface for the notifications domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}
}
