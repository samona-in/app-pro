import { DEFAULT_API_TIMEOUT_MS } from '@samona/config';
import { ApiErrorCode } from '@samona/types';
import { codeForStatus, createApiError, isApiErrorBody } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** Appended as a query string; `null`/`undefined` entries are dropped. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /** Overrides the client default for this call. */
  timeoutMs?: number;
  /** Send the request without an Authorization header (e.g. login). */
  skipAuth?: boolean;
  /** Caller-controlled cancellation, combined with the timeout signal. */
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  /** Base URL of the API. Always injected from the environment. */
  baseUrl: string;
  /** Path prefix appended to `baseUrl`, e.g. `/api/v1`. */
  prefix?: string;
  timeoutMs?: number;
  /** Resolves the current access token. Called per request, never cached here. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Invoked once per 401 so the app can clear its session. */
  onUnauthenticated?: () => void | Promise<void>;
  defaultHeaders?: Record<string, string>;
  /**
   * Rejects non-HTTPS base URLs (loopback excepted). Enable in production
   * builds so a misconfigured environment fails loudly instead of silently
   * sending bearer tokens in the clear.
   */
  requireHttps?: boolean;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** The typed HTTP surface shared by the SAMONA mobile apps. */
export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
}

/**
 * Parses `Retry-After`, which is either a delay in seconds or an HTTP date.
 *
 * Returns undefined for anything unparseable so callers fall back to their own
 * backoff rather than trusting a malformed header.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;

  return Math.max(0, date - Date.now());
}

function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.append(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

function joinUrl(base: string, prefix: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPrefix = prefix ? `/${prefix.replace(/^\/+|\/+$/g, '')}` : '';
  const trimmedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `${trimmedBase}${trimmedPrefix}${trimmedPath}`;
}

/**
 * Creates the typed HTTP client shared by the SAMONA mobile apps.
 *
 * It deliberately knows nothing about specific endpoints — feature code builds
 * typed service functions on top of it (CLAUDE.md "API"). Responsibilities kept
 * here: base URL, auth header, timeouts, JSON handling and one error shape.
 *
 * Configuration lives in the closure rather than on an instance, so nothing is
 * mutable or reachable from outside.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  if (!options.baseUrl) {
    throw new Error('createApiClient requires a baseUrl. Provide it from the environment.');
  }

  // Refuse cleartext outside development. Bearer tokens over plain HTTP are
  // readable by anyone on the network path; localhost is exempt because it
  // never leaves the device.
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(options.baseUrl);
  if (options.requireHttps === true && !options.baseUrl.startsWith('https://') && !isLoopback) {
    throw new Error(
      `Refusing to send requests to ${options.baseUrl} over plain HTTP. ` +
        'Use an https:// API URL, or a loopback address in development.',
    );
  }

  const baseUrl = options.baseUrl;
  const prefix = options.prefix ?? '';
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const defaultHeaders = options.defaultHeaders ?? {};
  const { getAccessToken, onUnauthenticated } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function handleResponse<T>(response: Response): Promise<T> {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      if (response.ok) return undefined as T;
    }

    const rawBody = await response.text();
    let parsed: unknown = undefined;
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody) as unknown;
      } catch {
        // Non-JSON body. Only an error if the response itself failed; a
        // successful non-JSON response is a contract violation either way.
        if (response.ok) {
          throw createApiError({
            code: ApiErrorCode.INTERNAL,
            message: 'The server returned an unreadable response.',
            status: response.status,
            requestId,
          });
        }
      }
    }

    if (response.ok) return parsed as T;

    if (response.status === 401) {
      await onUnauthenticated?.();
    }

    if (isApiErrorBody(parsed)) {
      throw createApiError({
        code: parsed.error.code,
        message: parsed.error.message,
        status: response.status,
        details: parsed.error.details,
        requestId: parsed.error.requestId ?? requestId,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }

    throw createApiError({
      code: codeForStatus(response.status),
      message: `Request failed with status ${response.status}.`,
      status: response.status,
      requestId,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = joinUrl(baseUrl, prefix, path) + buildQueryString(requestOptions.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...defaultHeaders,
      ...requestOptions.headers,
    };

    if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    }

    if (!requestOptions.skipAuth && getAccessToken) {
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = requestOptions.timeoutMs ?? defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    requestOptions.signal?.addEventListener('abort', onExternalAbort);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      // A caller-driven abort is not a client failure — surface it verbatim.
      if (requestOptions.signal?.aborted) throw cause;
      if (controller.signal.aborted) {
        throw createApiError({
          code: ApiErrorCode.TIMEOUT,
          message: `Request timed out after ${timeoutMs}ms.`,
          cause,
        });
      }
      throw createApiError({
        code: ApiErrorCode.NETWORK,
        message: 'Could not reach the server. Check your connection and try again.',
        cause,
      });
    } finally {
      clearTimeout(timeoutId);
      requestOptions.signal?.removeEventListener('abort', onExternalAbort);
    }

    return handleResponse<T>(response);
  }

  return {
    request,
    get: (path, requestOptions) => request('GET', path, undefined, requestOptions),
    post: (path, body, requestOptions) => request('POST', path, body, requestOptions),
    put: (path, body, requestOptions) => request('PUT', path, body, requestOptions),
    patch: (path, body, requestOptions) => request('PATCH', path, body, requestOptions),
    delete: (path, requestOptions) => request('DELETE', path, undefined, requestOptions),
  };
}
