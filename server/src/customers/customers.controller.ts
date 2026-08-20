import { Controller } from '@nestjs/common';
import { CustomersService } from './customers.service';

/**
 * HTTP surface for the customers domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}
}
