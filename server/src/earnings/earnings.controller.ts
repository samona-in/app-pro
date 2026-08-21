import { Controller } from '@nestjs/common';
import { EarningsService } from './earnings.service';

/**
 * HTTP surface for the earnings domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}
}
