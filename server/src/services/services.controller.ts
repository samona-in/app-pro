import { Controller } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * HTTP surface for the services domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}
}
