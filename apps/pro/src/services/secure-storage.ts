import * as SecureStore from 'expo-secure-store';

/**
 * Secure Store adapter for the Supabase client.
 *
 * Supabase persists the whole session — access token, refresh token and user —
 * as one JSON string. Secure Store warns above 2048 bytes and can fail on some
 * Android devices, and a Supabase session routinely exceeds that once custom
 * claims are added.
 *
 * So values are split into fixed-size chunks with a small index record. The
 * cost is a few extra keychain reads; the alternative is AsyncStorage, which
 * stores refresh tokens in plaintext on disk.
 */
const CHUNK_SIZE = 1800;

const indexKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(indexKey(key));
  const count = Number(raw ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Removes every chunk, so a shorter value cannot leave a longer one behind. */
async function clearChunks(key: string): Promise<void> {
  const count = await readChunkCount(key);
  const deletions: Promise<void>[] = [SecureStore.deleteItemAsync(indexKey(key))];
  for (let i = 0; i < count; i += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  }
  await Promise.all(deletions);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const count = await readChunkCount(key);
      if (count === 0) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
      );

      // A missing chunk means a partial write; treat the value as absent rather
      // than handing Supabase a truncated session it would fail to parse.
      if (parts.some((part) => part === null)) {
        await clearChunks(key);
        return null;
      }

      return parts.join('');
    } catch {
      // A locked device can make Secure Store throw. Signed-out is the safe
      // interpretation — Supabase will ask the user to sign in again.
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    // Written last: until the index exists the value reads as absent, so an
    // interrupted write cannot surface as a corrupt session.
    await SecureStore.setItemAsync(indexKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
  },
};
