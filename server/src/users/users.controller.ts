import { Controller } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * HTTP surface for the users domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
}
