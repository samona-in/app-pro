import { Controller } from '@nestjs/common';
import { LocationsService } from './locations.service';

/**
 * HTTP surface for the locations domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}
}
