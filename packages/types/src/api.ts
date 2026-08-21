/** Stable error codes returned by the API. Clients may branch on these. */
export const ApiErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * The single error envelope every API route returns on failure.
 *
 * Deliberately free of stack traces, driver errors and infrastructure detail
 * (CLAUDE.md "Error Handling").
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level messages, keyed by dotted field path. */
    details?: Record<string, string[]>;
    /** Correlates a client-visible failure with the server log entry. */
    requestId?: string;
  };
}

export interface PageMeta {
  total: number;
  limit: number;
  cursor: string | null;
  hasMore: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}
