/**
 * Shared helpers for the Supabase Auth migration scripts.
 *
 * Functional throughout, matching the repository convention: no classes and no
 * dependencies beyond the Node standard library. Nothing here logs or forwards
 * a credential.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Writes via a temp file + rename so an interrupted run never leaves partial JSON. */
export function writeAtomicJson(file, value) {
  const temporary = `${file}.tmp`;
  writeJson(temporary, value);
  renameSync(temporary, file);
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Shows only the last four characters of a phone number; never logs full PII. */
export function maskPhone(phone) {
  if (!phone) return '(none)';
  const value = String(phone);
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/** True for HTTP statuses worth retrying: transient server or rate-limit responses. */
export function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Retries `fn` with exponential backoff. An error is retried unless it is
 * explicitly marked `retryable = false` (a 4xx we should not repeat).
 */
export async function withRetry(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || error?.retryable === false) break;
      const delay = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(`  retry ${attempt}/${attempts - 1} ${label} in ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Runs `worker` over `items` with a bounded number of parallel workers. */
export async function runPool(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

export function createStateStore(stateDir, fresh) {
  ensureDir(stateDir);
  const stateFile = path.join(stateDir, 'state.json');
  if (fresh && existsSync(stateFile)) {
    const archive = path.join(
      stateDir,
      `state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    renameSync(stateFile, archive);
  }
  return stateFile;
}

export function createLogger(stateDir, name = 'migration.log') {
  ensureDir(stateDir);
  const logFile = path.join(stateDir, name);
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    appendFileSync(logFile, `${line}\n`, 'utf8');
  };
}

/**
 * Calls the Supabase Auth API with the service-role key.
 *
 * The key is sent as both `apikey` and `Authorization`, the same way the
 * server's own admin client does. It is never logged or written to a report.
 */
export async function authFetch({ baseUrl, serviceKey, route, method = 'GET', body }) {
  const url = `${baseUrl.replace(/\/+$/, '')}${route}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    const error = new Error(`network error on ${method} ${route}: ${cause.message}`);
    error.retryable = true;
    throw error;
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, ok: response.ok, json, text };
}

/** Minimal `--flag` / `--flag value` parser. */
export function parseFlags(argv, { boolean = [], value = [] } = {}) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (boolean.includes(name)) {
      flags[name] = true;
    } else if (value.includes(name)) {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value.`);
      flags[name] = argv[i];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return flags;
}

/** Normalizes a phone number to digits for matching across formats. */
export function phoneKey(phone) {
  return phone ? String(phone).replace(/[^\d+]/g, '') : null;
}

/** Host of a URL, safe to log; falls back to the raw string if unparseable. */
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Lists every Auth user on a project, following GoTrue's `nextPage` cursor.
 * Pagination is bounded so a malformed response can never loop forever.
 */
export async function listAllUsers({ baseUrl, serviceKey, pageSize = 1000 }) {
  const users = [];
  let page = 1;
  for (let guard = 0; guard < 10_000; guard += 1) {
    const response = await withRetry(`list users page ${page}`, async () => {
      const result = await authFetch({
        baseUrl,
        serviceKey,
        route: `/auth/v1/admin/users?page=${page}&per_page=${pageSize}`,
      });
      if (!result.ok) {
        const error = new Error(
          `list users returned HTTP ${result.status}: ${result.text.slice(0, 200)}`,
        );
        error.retryable = isRetryableStatus(result.status);
        throw error;
      }
      return result;
    });

    const batch = response.json?.users ?? [];
    users.push(...batch);
    const next = response.json?.nextPage;
    if (!next || batch.length === 0 || next === page) break;
    page = next;
  }
  return users;
}
