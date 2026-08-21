import { ApiErrorCode } from '@samona/types';

/**
 * The error type route handlers throw.
 *
 * Anything thrown that is not an `HttpError` is treated as an unexpected
 * failure: logged in full server-side, reported to the client as a generic
 * message (CLAUDE.md "Error Handling").
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options?: { details?: Record<string, string[]>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
  }
}

export const badRequest = (message = 'Request could not be processed.') =>
  new HttpError(400, ApiErrorCode.BAD_REQUEST, message);

export const validationFailed = (details: Record<string, string[]>) =>
  new HttpError(422, ApiErrorCode.VALIDATION_FAILED, 'Some fields need attention.', { details });

export const unauthenticated = (message = 'You need to sign in to continue.') =>
  new HttpError(401, ApiErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new HttpError(403, ApiErrorCode.FORBIDDEN, message);

export const notFound = (message = 'Not found.') =>
  new HttpError(404, ApiErrorCode.NOT_FOUND, message);

export const conflict = (message = 'That conflicts with the current state.') =>
  new HttpError(409, ApiErrorCode.CONFLICT, message);
