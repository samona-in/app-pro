/**
 * Minimal structured logger.
 *
 * Deliberately dependency-free for the scaffold. Swap the implementation here
 * (pino, winston) without touching call sites.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;

  if (level === 'error') {
    // Full detail server-side only; never returned to a client.
    console.error(line, meta instanceof Error ? meta.stack : (meta ?? ''));
    return;
  }
  if (level === 'warn') {
    console.warn(line, meta ?? '');
    return;
  }
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;

  console.warn(line, meta ?? '');
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
