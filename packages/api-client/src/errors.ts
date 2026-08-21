import { ApiErrorCode, type ApiErrorBody } from '@samona/types';

/**
 * The single error shape every client call rejects with.
 *
 * Transport failures, timeouts and API error envelopes are all normalised into
 * this shape so callers have exactly one thing to catch.
 *
 * It is a real `Error` — built with the platform constructor so stack traces
 * and `instanceof Error` keep working — with our fields attached. There is no
 * `ApiError` class to subclass, so identify one with `isApiError` rather than
 * `instanceof`.
 */
export interface ApiError extends Error {
  readonly name: 'ApiError';
  readonly code: ApiErrorCode;
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;
}

export interface CreateApiErrorParams {
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: Record<string, string[]>;
  requestId?: string;
  cause?: unknown;
}

export function createApiError(params: CreateApiErrorParams): ApiError {
  const error = new Error(params.message, { cause: params.cause }) as Error & {
    -readonly [K in keyof ApiError]: ApiError[K];
  };

  error.name = 'ApiError';
  error.code = params.code;
  error.status = params.status ?? 0;
  if (params.details) error.details = params.details;
  if (params.requestId) error.requestId = params.requestId;

  return error;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && error.name === 'ApiError' && 'code' in error;
}

/** True when retrying the same request could plausibly succeed. */
export function isRetryable(error: unknown): boolean {
  if (!isApiError(error)) return false;

  return (
    error.code === ApiErrorCode.NETWORK ||
    error.code === ApiErrorCode.TIMEOUT ||
    error.status >= 500 ||
    error.status === 429
  );
}

/** True when the failure is an authentication or authorisation problem. */
export function isAuthError(error: unknown): boolean {
  if (!isApiError(error)) return false;

  return error.code === ApiErrorCode.UNAUTHENTICATED || error.code === ApiErrorCode.FORBIDDEN;
}

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: ApiErrorCode.BAD_REQUEST,
  401: ApiErrorCode.UNAUTHENTICATED,
  403: ApiErrorCode.FORBIDDEN,
  404: ApiErrorCode.NOT_FOUND,
  409: ApiErrorCode.CONFLICT,
  422: ApiErrorCode.VALIDATION_FAILED,
  429: ApiErrorCode.RATE_LIMITED,
};

export function codeForStatus(status: number): ApiErrorCode {
  return STATUS_TO_CODE[status] ?? ApiErrorCode.INTERNAL;
}

/** Narrows an unknown parsed body to the API error envelope. */
export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body as { error: unknown };
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}
