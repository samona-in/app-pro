import { createHash } from 'node:crypto';

/** Correlates lifecycle logs without recording a usable registration token. */
export function pushTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}
