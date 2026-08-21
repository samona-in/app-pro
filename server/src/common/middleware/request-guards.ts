import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { badRequest, createHttpError } from '../errors';
import { ApiErrorCode } from '@samona/types';

/**
 * Request-shape guards that run before any handler.
 *
 * Each blocks a cheap attack that input validation alone does not: validation
 * runs *after* the body has already been parsed, so a hostile payload has
 * already cost CPU and memory by then.
 */

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Requires `Content-Type: application/json` on writes.
 *
 * Rejecting other types keeps the API off the list of endpoints reachable by a
 * cross-origin HTML form post, which cannot set a JSON content type and so
 * cannot forge a state-changing request this way.
 */
export function enforceJsonContentType(req: Request, _res: Response, next: NextFunction): void {
  if (!METHODS_WITH_BODY.has(req.method)) {
    next();
    return;
  }

  // A body-less POST is legitimate; only inspect requests that carry one.
  const hasBody = req.get('content-length') !== undefined && req.get('content-length') !== '0';
  const isChunked = req.get('transfer-encoding') !== undefined;
  if (!hasBody && !isChunked) {
    next();
    return;
  }

  if (!req.is('application/json')) {
    next(
      createHttpError(
        415,
        ApiErrorCode.BAD_REQUEST,
        'This endpoint accepts application/json only.',
      ),
    );
    return;
  }

  next();
}

/**
 * Rejects deeply nested or absurdly wide JSON.
 *
 * `express.json({ limit })` bounds bytes, not shape. A small payload like
 * `[[[[...]]]]` can still force pathological work in downstream validators and
 * serialisers, so depth and breadth are bounded explicitly.
 */
export function limitJsonShape(maxDepth = 12, maxKeys = 1000): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const body: unknown = req.body;
    if (body === null || typeof body !== 'object') {
      next();
      return;
    }

    let keyCount = 0;

    // Iterative walk: a recursive one would blow its own stack on the exact
    // input this is meant to reject.
    const stack: { value: unknown; depth: number }[] = [{ value: body, depth: 1 }];

    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) break;

      const { value, depth } = entry;
      if (depth > maxDepth) {
        next(badRequest('Request body is nested too deeply.'));
        return;
      }
      if (value === null || typeof value !== 'object') continue;

      const children = Array.isArray(value) ? value : Object.values(value);
      keyCount += children.length;
      if (keyCount > maxKeys) {
        next(badRequest('Request body has too many fields.'));
        return;
      }

      for (const child of children) {
        if (child !== null && typeof child === 'object') {
          stack.push({ value: child, depth: depth + 1 });
        }
      }
    }

    next();
  };
}

/**
 * Strips prototype-polluting keys from parsed bodies.
 *
 * `JSON.parse` happily produces a `__proto__` key. Any downstream merge or
 * assign that copies it can alter `Object.prototype` for the whole process.
 */
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function blockPrototypePollution(req: Request, _res: Response, next: NextFunction): void {
  const seen = new Set<object>();
  const stack: unknown[] = [req.body];

  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);

    for (const key of Object.keys(value)) {
      if (POLLUTING_KEYS.has(key)) {
        next(badRequest('Request body contains a disallowed field name.'));
        return;
      }
      stack.push((value as Record<string, unknown>)[key]);
    }
  }

  next();
}
