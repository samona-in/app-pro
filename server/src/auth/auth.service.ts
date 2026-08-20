import { Injectable } from '@nestjs/common';

/**
 * Auth domain service.
 *
 * Issues and refreshes tokens for every SAMONA surface (Customer, Pro,
 * Admin). One authentication system serves all three; the role travels in
 * the verified token and is never accepted from the client.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
@Injectable()
export class AuthService {}
