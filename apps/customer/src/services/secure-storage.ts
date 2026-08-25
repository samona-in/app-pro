import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

const indexKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(indexKey(key));
  const count = Number(raw ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

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

      if (parts.some((part) => part === null)) {
        await clearChunks(key);
        return null;
      }

      return parts.join('');
    } catch {
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
    await SecureStore.setItemAsync(indexKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
  },
};
