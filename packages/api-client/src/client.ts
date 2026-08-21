import { DEFAULT_API_TIMEOUT_MS } from '@samona/config';
import { ApiErrorCode } from '@samona/types';
import { ApiError, codeForStatus, isApiErrorBody } from './errors';

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
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
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
 * Minimal typed HTTP client shared by the SAMONA mobile apps.
 *
 * It deliberately knows nothing about specific endpoints — feature code builds
 * typed service functions on top of it (CLAUDE.md "API"). Responsibilities kept
 * here: base URL, auth header, timeouts, JSON handling and one error shape.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly prefix: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly getAccessToken?: ApiClientOptions['getAccessToken'];
  private readonly onUnauthenticated?: ApiClientOptions['onUnauthenticated'];
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    if (!options.baseUrl) {
      throw new Error('ApiClient requires a baseUrl. Provide it from the environment.');
    }
    this.baseUrl = options.baseUrl;
    this.prefix = options.prefix ?? '';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.getAccessToken = options.getAccessToken;
    this.onUnauthenticated = options.onUnauthenticated;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = joinUrl(this.baseUrl, this.prefix, path) + buildQueryString(options.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    }

    if (!options.skipAuth && this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      // A caller-driven abort is not a client failure — surface it verbatim.
      if (options.signal?.aborted) throw cause;
      if (controller.signal.aborted) {
        throw new ApiError({
          code: ApiErrorCode.TIMEOUT,
          message: `Request timed out after ${timeoutMs}ms.`,
          cause,
        });
      }
      throw new ApiError({
        code: ApiErrorCode.NETWORK,
        message: 'Could not reach the server. Check your connection and try again.',
        cause,
      });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const requestId = response.headers.get('x-request-id') ?? undefined;

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
          throw new ApiError({
            code: ApiErrorCode.INTERNAL,
            message: 'The server returned an unreadable response.',
            status: response.status,
            requestId,
          });
        }
      }
    }

    if (response.ok) {
      return parsed as T;
    }

    if (response.status === 401) {
      await this.onUnauthenticated?.();
    }

    if (isApiErrorBody(parsed)) {
      throw new ApiError({
        code: parsed.error.code,
        message: parsed.error.message,
        status: response.status,
        details: parsed.error.details,
        requestId: parsed.error.requestId ?? requestId,
      });
    }

    throw new ApiError({
      code: codeForStatus(response.status),
      message: `Request failed with status ${response.status}.`,
      status: response.status,
      requestId,
    });
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
