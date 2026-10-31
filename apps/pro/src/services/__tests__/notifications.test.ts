import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { createApiError } from '@samona/api-client';
import { ApiErrorCode } from '@samona/types';
import { api } from '../api';
import { startPushTokenSync } from '../notifications';

jest.mock('../api', () => ({ api: { post: jest.fn() } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { sessionId: 'unique-install-session-id', easConfig: { projectId: 'test-eas-project' } },
}));
jest.mock('../overlay-alert', () => ({
  getNativeDeviceId: jest.fn().mockResolvedValue('native-device-1'),
  configureJobAlertModule: jest.fn().mockResolvedValue(undefined),
  promptForOverlayPermissionOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../full-screen-alert', () => ({
  promptForFullScreenIntentOnce: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
}));

const post = api.post as jest.Mock;
const nativeToken = Notifications.getDevicePushTokenAsync as jest.Mock;
let tokenListener: (token: Notifications.DevicePushToken) => void;
let appStateListener: (state: AppStateStatus) => void;
let removeTokenListener: jest.Mock;
let sync: ReturnType<typeof startPushTokenSync> | undefined;
const flush = async () => {
  for (let n = 0; n < 60; n++) await Promise.resolve();
};

describe('Pro push-token lifecycle', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    await SecureStore.deleteItemAsync('samona.push-unregister-pending');
    post.mockReset().mockResolvedValue(undefined);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    removeTokenListener = jest.fn();
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation((listener) => {
      tokenListener = listener;
      return { remove: removeTokenListener };
    });
    nativeToken.mockReset().mockImplementation(async () => {
      const token = { type: 'android', data: 'native-fcm-token-1' };
      // Expo can emit while fetching the token: this must not cause a loop.
      tokenListener(token as Notifications.DevicePushToken);
      return token;
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    sync?.stop();
    sync = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function start(getToken = async () => 'bearer-for-user-1') {
    sync = startPushTokenSync('user-1', getToken);
    return sync;
  }

  it('syncs the native FCM token at startup with its device and authenticated session', async () => {
    start();
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/notifications/register-token',
      {
        pushToken: 'native-fcm-token-1',
        deviceId: 'native-device-1',
        provider: 'fcm',
        platform: 'android',
      },
      expect.objectContaining({
        skipAuth: true,
        headers: { Authorization: 'Bearer bearer-for-user-1' },
      }),
    );
    expect(JSON.stringify((console.log as jest.Mock).mock.calls)).not.toContain(
      'native-fcm-token-1',
    );
  });

  it('uploads refresh events without recursively fetching another native token', async () => {
    start();
    await flush();
    tokenListener({ type: 'android', data: 'native-fcm-token-2' });
    await flush();
    expect(nativeToken).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('native-fcm-token-2');
  });

  it('retries a failed synchronization using the latest refreshed token', async () => {
    post.mockRejectedValueOnce(createApiError({ code: ApiErrorCode.NETWORK, message: 'offline' }));
    start();
    await flush();
    tokenListener({ type: 'android', data: 'native-fcm-token-2' });
    await flush();
    await jest.advanceTimersByTimeAsync(60000);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('native-fcm-token-2');
    expect(
      post.mock.calls.filter((call) => call[1].pushToken === 'native-fcm-token-1'),
    ).toHaveLength(1);
  });

  it('re-fetches the current native token when the app becomes active', async () => {
    start();
    await flush();
    nativeToken.mockResolvedValue({ type: 'android', data: 'startup-after-background-token' });
    appStateListener('active');
    await flush();
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('startup-after-background-token');
  });

  it('rechecks foreground tokens without repeatedly uploading a recently confirmed registration', async () => {
    start();
    await flush();
    appStateListener('active');
    await flush();
    appStateListener('active');
    await flush();
    expect(nativeToken).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60001);
    appStateListener('active');
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('lets a slow registration finish without timing out and submitting it again', async () => {
    post.mockImplementationOnce(
      (_path, _body, options) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(createApiError({ code: ApiErrorCode.TIMEOUT, message: 'timeout' })),
            options.timeoutMs,
          );
          setTimeout(() => {
            clearTimeout(timeout);
            resolve(undefined);
          }, 12000);
        }),
    );
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(12000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Registered device'));
  });

  it('distinguishes request timeouts in safe synchronization failure logs', async () => {
    post.mockRejectedValueOnce(
      createApiError({
        code: ApiErrorCode.TIMEOUT,
        message: 'request containing a private token timed out',
      }),
    );
    start();
    await flush();
    expect(console.warn).toHaveBeenCalledWith(
      '[Notifications] Token synchronization failed',
      expect.objectContaining({ status: 0, code: ApiErrorCode.TIMEOUT }),
    );
    expect(JSON.stringify((console.warn as jest.Mock).mock.calls)).not.toContain('private token');
  });

  it('cancels listeners and retries when the authenticated lifecycle ends', async () => {
    post.mockRejectedValue(createApiError({ code: ApiErrorCode.NETWORK, message: 'offline' }));
    const controller = start();
    await flush();
    controller.stop();
    const count = post.mock.calls.length;
    tokenListener({ type: 'android', data: 'late-token' });
    await jest.advanceTimersByTimeAsync(60000);
    expect(removeTokenListener).toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(count);
  });

  it('unregisters only this installation before logout', async () => {
    const controller = start();
    await flush();
    await controller.unregister();
    expect(post.mock.calls.at(-1)).toEqual([
      '/notifications/unregister-token',
      { deviceId: 'native-device-1' },
      expect.objectContaining({ skipAuth: true }),
    ]);
    const count = post.mock.calls.length;
    tokenListener({ type: 'android', data: 'late-token' });
    await flush();
    expect(post).toHaveBeenCalledTimes(count);
  });

  it('remembers offline logout cleanup and completes it before registering on the next login', async () => {
    const controller = start();
    await flush();
    post.mockRejectedValueOnce(createApiError({ code: ApiErrorCode.NETWORK, message: 'offline' }));
    await controller.unregister();
    post.mockClear();
    start();
    await flush();
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      '/notifications/unregister-token',
      '/notifications/register-token',
    ]);
  });

  it('does not register with another user after an asynchronous session change', async () => {
    start(async () => null as never);
    await flush();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not retry a permanent API validation failure', async () => {
    post.mockRejectedValue(
      createApiError({ code: ApiErrorCode.BAD_REQUEST, message: 'invalid', status: 400 }),
    );
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(60000);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retries native token retrieval failures without blocking login', async () => {
    nativeToken.mockRejectedValueOnce(new Error('Firebase is offline'));
    start();
    await flush();
    expect(post).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('native-fcm-token-1');
  });

  it('honors Retry-After even when a newer token arrives during backoff', async () => {
    post.mockRejectedValueOnce(
      createApiError({
        code: ApiErrorCode.RATE_LIMITED,
        message: 'wait',
        status: 429,
        retryAfterMs: 10000,
      }),
    );
    start();
    await flush();
    tokenListener({ type: 'android', data: 'native-fcm-token-2' });
    await flush();
    await jest.advanceTimersByTimeAsync(9000);
    expect(post).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('native-fcm-token-2');
  });

  it('waits for an in-flight registration before unregistering and discards queued refreshes', async () => {
    let finishUpload!: () => void;
    post.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );
    const controller = start();
    await flush();
    tokenListener({ type: 'android', data: 'queued-token-during-logout' });
    const logout = controller.unregister();
    await flush();
    finishUpload();
    await logout;
    await flush();
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      '/notifications/register-token',
      '/notifications/unregister-token',
    ]);
  });

  it('keeps iOS on Expo delivery and never uploads an APNs token as FCM', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    nativeToken.mockResolvedValue({ type: 'ios', data: 'native-apns-token' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExpoPushToken[test-ios]',
    });
    start();
    await flush();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({
      platform: 'ios',
      provider: 'expo',
      pushToken: 'ExpoPushToken[test-ios]',
    });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        devicePushToken: { type: 'ios', data: 'native-apns-token' },
      }),
    );
  });

  it('can unregister while Firebase native token retrieval is still waiting for a network', async () => {
    nativeToken.mockImplementationOnce(() => new Promise(() => undefined));
    const controller = start();
    await flush();
    void controller.unregister();
    await flush();
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/notifications/unregister-token']);
  });

  it('retries pending logout cleanup even when notification permission is now denied', async () => {
    const controller = start();
    await flush();
    post.mockRejectedValueOnce(createApiError({ code: ApiErrorCode.NETWORK, message: 'offline' }));
    await controller.unregister();
    post.mockClear();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    start();
    await flush();
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/notifications/unregister-token']);
  });

  it('does not discard a newer token queued during a permanent failure of an old upload', async () => {
    let rejectUpload!: (error: Error) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    start();
    await flush();
    tokenListener({ type: 'android', data: 'native-fcm-token-2' });
    rejectUpload(
      createApiError({ code: ApiErrorCode.BAD_REQUEST, message: 'old token invalid', status: 400 }),
    );
    await flush();
    expect(post.mock.calls.map((call) => call[1].pushToken)).toEqual([
      'native-fcm-token-1',
      'native-fcm-token-2',
    ]);
  });
});
