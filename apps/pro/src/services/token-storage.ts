import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '@samona/config';

/**
 * Persistence for auth tokens.
 *
 * Tokens go to the device keychain/keystore via Secure Store, never to
 * AsyncStorage or a Zustand persist layer.
 */
export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_STORE_KEYS.accessToken);
  },

  async setTokens(accessToken: string, refreshToken?: string): Promise<void> {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.accessToken, accessToken);
    if (refreshToken) {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.refreshToken, refreshToken);
    }
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.accessToken),
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.refreshToken),
    ]);
  },
};
