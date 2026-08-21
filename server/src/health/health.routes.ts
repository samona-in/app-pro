import { Router } from 'express';

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Unauthenticated liveness probe for load balancers and deploy checks.
 *
 * Deliberately reveals nothing about versions, dependencies or infrastructure.
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  return router;
}
