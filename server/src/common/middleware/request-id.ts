import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Ensures every request carries an `x-request-id`, echoed on the response.
 *
 * This is what ties a user-facing error message back to a server log entry
 * without exposing anything internal.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.get('x-request-id') ?? randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}
