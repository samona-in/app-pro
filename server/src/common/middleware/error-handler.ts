import type { NextFunction, Request, Response } from 'express';
import { ApiErrorCode, type ApiErrorBody } from '@samona/types';
import { isHttpError, notFound } from '../errors';
import { logger } from '../logger';

/** Terminal 404 for unmatched routes; hands off to the error handler. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`Cannot ${req.method} ${req.path}`));
}

/**
 * Turns every error into the one API error envelope.
 *
 * Two rules from CLAUDE.md "Error Handling" are enforced here:
 *  1. Nothing is swallowed — every failure is logged server-side.
 *  2. Nothing internal leaks — stack traces, driver errors and infrastructure
 *     detail never reach the client. Unexpected errors return a generic message
 *     plus a request id the operator can correlate with the log.
 *
 * Express 5 forwards rejected promises from async handlers here automatically.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express delegates to the default handler once headers are sent.
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = req.get('x-request-id') ?? undefined;
  const isKnown = isHttpError(error);
  const status = isKnown ? error.status : 500;

  if (status >= 500) {
    logger.error(
      `${req.method} ${req.originalUrl} failed (requestId=${requestId ?? 'none'})`,
      error,
    );
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status} (requestId=${requestId ?? 'none'})`);
  }

  const body: ApiErrorBody = {
    error: {
      code: isKnown ? error.code : ApiErrorCode.INTERNAL,
      // Only messages we authored are safe to return verbatim.
      message: isKnown ? error.message : 'Something went wrong. Please try again.',
      ...(isKnown && error.details ? { details: error.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };

  res.status(status).json(body);
}
