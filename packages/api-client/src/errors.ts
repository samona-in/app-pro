import { ApiErrorCode, type ApiErrorBody } from '@samona/types';

/**
 * The single error type every client call rejects with.
 *
 * Transport failures, timeouts and API error envelopes are all normalised into
 * this shape so callers have exactly one thing to catch.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(params: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    details?: Record<string, string[]>;
    requestId?: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status ?? 0;
    this.details = params.details;
    this.requestId = params.requestId;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.code === ApiErrorCode.NETWORK ||
      this.code === ApiErrorCode.TIMEOUT ||
      this.status >= 500 ||
      this.status === 429
    );
  }

  get isAuthError(): boolean {
    return this.code === ApiErrorCode.UNAUTHENTICATED || this.code === ApiErrorCode.FORBIDDEN;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
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
