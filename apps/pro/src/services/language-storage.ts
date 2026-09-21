import * as SecureStore from 'expo-secure-store';

const LANGUAGE_KEY = 'samona.language';

export type StoredLanguage = 'en' | 'te' | 'hi';

const SUPPORTED_CODES: readonly string[] = ['en', 'te', 'hi'];

export function isStoredLanguage(code: string | null | undefined): code is StoredLanguage {
  return code !== null && code !== undefined && SUPPORTED_CODES.includes(code);
}

/** Reads the persisted app language, or null when the user has not chosen one yet. */
export async function getStoredLanguage(): Promise<StoredLanguage | null> {
  try {
    const stored = await SecureStore.getItemAsync(LANGUAGE_KEY);
    return isStoredLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persists the app language so it survives restarts, sign-outs and re-sign-ins. */
export async function storeLanguage(language: StoredLanguage): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}