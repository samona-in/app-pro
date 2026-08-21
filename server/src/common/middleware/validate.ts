import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { validationFailed } from '../errors';

type Target = 'body' | 'query' | 'params';

/**
 * Validates part of a request against a Zod schema and replaces it with the
 * parsed value, so handlers receive typed, coerced data.
 *
 * The server is the authority on validity; the client's own checks are a UX
 * convenience only (CLAUDE.md "Validation"). Sharing schemas through
 * `@samona/validation` keeps the two in agreement.
 *
 * Usage: `router.post('/', validate(createJobSchema), handler)`
 */
export function validate(schema: ZodType, target: Target = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }
      next(validationFailed(details));
      return;
    }

    // req.query is a getter in Express 5, so assign through defineProperty.
    Object.defineProperty(req, target, { value: result.data, writable: true });
    next();
  };
}
