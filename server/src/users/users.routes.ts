import { Router } from 'express';
import type { Services } from '../context';

/**
 * HTTP surface for the users domain, mounted at `/users`.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must go through `requireAuth`/`requireRole` and validate its input with a
 * shared Zod schema (CLAUDE.md "Security", "Validation").
 */
export function createUsersRouter(services: Services): Router {
  const router = Router();
  void services;
  return router;
}
