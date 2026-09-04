import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  isFullScreenIntentEnabled,
  promptForFullScreenIntentOnce,
  requestFullScreenIntent,
} from '../full-screen-alert';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedSecureStore = jest.mocked(SecureStore);

// NOTE: these tests run without a native module present. Under jest, expo's
// `requireNativeModule` resolves through jest-expo's shim and reports the
// module missing, which is exactly the graceful-degradation path the service
// must handle (e.g. an APK that predates the full-screen feature). The
// "module found" branch is a thin delegation to the native side and is
// exercised by native-side tests instead.

describe('full-screen-alert', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockedSecureStore.getItemAsync.mockReset();
    mockedSecureStore.setItemAsync.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isFullScreenIntentEnabled', () => {
    it('is false off Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await expect(isFullScreenIntentEnabled()).resolves.toBe(false);
    });

    it('is false when the native module is missing', async () => {
      await expect(isFullScreenIntentEnabled()).resolves.toBe(false);
    });
  });

  describe('requestFullScreenIntent', () => {
    it('is a no-op off Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await expect(requestFullScreenIntent()).resolves.toBe(false);
    });

    it('returns false when the native module is missing', async () => {
      await expect(requestFullScreenIntent()).resolves.toBe(false);
    });
  });

  describe('promptForFullScreenIntentOnce', () => {
    it('marks the install as prompted before requesting', async () => {
      mockedSecureStore.getItemAsync.mockResolvedValue(null);
      await promptForFullScreenIntentOnce();
      expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
        'samona.full-screen-intent-prompted',
        '1',
      );
    });

    it('never nags twice on the same install', async () => {
      mockedSecureStore.getItemAsync.mockResolvedValue('1');
      await promptForFullScreenIntentOnce();
      expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it('is a no-op off Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await promptForFullScreenIntentOnce();
      expect(mockedSecureStore.getItemAsync).not.toHaveBeenCalled();
      expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });
});