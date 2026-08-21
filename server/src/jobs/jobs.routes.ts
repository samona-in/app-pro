import { Router } from 'express';
import type { Services } from '../context';

/**
 * HTTP surface for the jobs domain, mounted at `/jobs`.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must go through `requireAuth`/`requireRole` and validate its input with a
 * shared Zod schema (CLAUDE.md "Security", "Validation").
 */
export function createJobsRouter(services: Services): Router {
  const router = Router();
  void services;
  return router;
}
