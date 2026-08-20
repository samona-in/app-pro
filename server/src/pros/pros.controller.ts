import { Controller } from '@nestjs/common';
import { ProsService } from './pros.service';

/**
 * HTTP surface for the pros domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('pros')
export class ProsController {
  constructor(private readonly prosService: ProsService) {}
}
