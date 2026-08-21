import { ApiErrorCode } from '@samona/types';

/**
 * The error shape route handlers throw.
 *
 * It is a real `Error` — built with the platform constructor so stack traces
 * keep working — with our fields attached. There is no `HttpError` class to
 * subclass, so identify one with `isHttpError` rather than `instanceof`.
 *
 * Anything thrown that is *not* an `HttpError` is treated as an unexpected
 * failure: logged in full server-side, reported to the client as a generic
 * message (CLAUDE.md "Error Handling").
 */
export interface HttpError extends Error {
  readonly name: 'HttpError';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string[]>;
}

export interface HttpErrorOptions {
  details?: Record<string, string[]>;
  cause?: unknown;
}

export function createHttpError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: HttpErrorOptions,
): HttpError {
  const error = new Error(message, { cause: options?.cause }) as Error & {
    -readonly [K in keyof HttpError]: HttpError[K];
  };

  error.name = 'HttpError';
  error.status = status;
  error.code = code;
  if (options?.details) error.details = options.details;

  return error;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && error.name === 'HttpError' && 'status' in error;
}

export const badRequest = (message = 'Request could not be processed.') =>
  createHttpError(400, ApiErrorCode.BAD_REQUEST, message);

export const validationFailed = (details: Record<string, string[]>) =>
  createHttpError(422, ApiErrorCode.VALIDATION_FAILED, 'Some fields need attention.', {
    details,
  });

export const unauthenticated = (message = 'You need to sign in to continue.') =>
  createHttpError(401, ApiErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  createHttpError(403, ApiErrorCode.FORBIDDEN, message);

export const notFound = (message = 'Not found.') =>
  createHttpError(404, ApiErrorCode.NOT_FOUND, message);

export const conflict = (message = 'That conflicts with the current state.') =>
  createHttpError(409, ApiErrorCode.CONFLICT, message);
