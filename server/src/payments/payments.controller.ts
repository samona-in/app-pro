import { Controller } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * HTTP surface for the payments domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
}
