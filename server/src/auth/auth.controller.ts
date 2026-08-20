import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * HTTP surface for the auth domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
}
