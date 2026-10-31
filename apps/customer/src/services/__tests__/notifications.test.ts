import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createApiError } from '@samona/api-client';
import { ApiErrorCode } from '@samona/types';
import { api } from '../api';
import { startPushTokenSync } from '../notifications';

jest.mock('../api', () => ({ api: { post: jest.fn() } }));
jest.mock('@/env', () => ({ env: { easProjectId: 'customer-eas-project' } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
}));

const post = api.post as jest.Mock;
const nativeToken = Notifications.getDevicePushTokenAsync as jest.Mock;
let tokenListener: (token: Notifications.DevicePushToken) => void;
let stateListener: (state: AppStateStatus) => void;
let sync: ReturnType<typeof startPushTokenSync> | undefined;
const flush = async () => {
  for (let n = 0; n < 60; n++) await Promise.resolve();
};

describe('customer push registration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    post.mockReset().mockResolvedValue(undefined);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    (Notifications.setNotificationChannelAsync as jest.Mock).mockClear();
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation((listener) => {
      tokenListener = listener;
      return { remove: jest.fn() };
    });
    nativeToken.mockReset().mockImplementation(async () => {
      const token = { type: 'android', data: 'customer-native-token-1' };
      tokenListener(token as Notifications.DevicePushToken);
      return token;
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      stateListener = listener;
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

  function start(getToken: () => Promise<string | null> = async () => 'customer-bearer') {
    sync = startPushTokenSync(getToken);
    return sync;
  }

  it('registers the native token on startup with the current customer session', async () => {
    start();
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/notifications/register-token',
      {
        pushToken: 'customer-native-token-1',
        platform: 'android',
        provider: 'fcm',
      },
      expect.objectContaining({
        skipAuth: true,
        headers: { Authorization: 'Bearer customer-bearer' },
      }),
    );
    expect(JSON.stringify((console.log as jest.Mock).mock.calls)).not.toContain(
      'customer-native-token-1',
    );
  });

  it('creates high-importance channels for booking updates, start-work codes, and chat', async () => {
    start();
    await flush();
    for (const channel of ['job_updates', 'job_otp', 'chat_messages_v2']) {
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        channel,
        expect.objectContaining({ importance: 4, enableVibrate: true }),
      );
    }
  });

  it('uploads token refresh events without fetching recursively', async () => {
    start();
    await flush();
    tokenListener({ type: 'android', data: 'customer-native-token-2' });
    await flush();
    expect(nativeToken).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('customer-native-token-2');
  });

  it('recovers from native token retrieval failure', async () => {
    nativeToken.mockRejectedValueOnce(new Error('Firebase network unavailable'));
    start();
    await flush();
    expect(post).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('customer-native-token-1');
  });

  it('retries transient registration failures with the newest token and honors Retry-After', async () => {
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
    tokenListener({ type: 'android', data: 'customer-native-token-2' });
    await flush();
    await jest.advanceTimersByTimeAsync(9000);
    expect(post).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('customer-native-token-2');
  });

  it('rechecks the token when the customer returns to the foreground', async () => {
    start();
    await flush();
    nativeToken.mockResolvedValue({ type: 'android', data: 'foreground-native-token' });
    stateListener('active');
    await flush();
    expect(post.mock.calls.at(-1)?.[1].pushToken).toBe('foreground-native-token');
  });

  it('rechecks foreground tokens without repeatedly uploading a recently confirmed registration', async () => {
    start();
    await flush();
    stateListener('active');
    await flush();
    stateListener('active');
    await flush();
    expect(nativeToken).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60001);
    stateListener('active');
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
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Customer device registered'));
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
      '[Notifications] Customer token synchronization failed',
      expect.objectContaining({ status: 0, code: ApiErrorCode.TIMEOUT }),
    );
    expect(JSON.stringify((console.warn as jest.Mock).mock.calls)).not.toContain('private token');
  });

  it('does not retry a permanent registration error without another event', async () => {
    post.mockRejectedValue(
      createApiError({ code: ApiErrorCode.BAD_REQUEST, message: 'invalid', status: 400 }),
    );
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(60000);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('preserves a refresh queued while an older upload is permanently rejected', async () => {
    let reject!: (error: Error) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectUpload) => {
          reject = rejectUpload;
        }),
    );
    start();
    await flush();
    tokenListener({ type: 'android', data: 'customer-native-token-2' });
    reject(
      createApiError({
        code: ApiErrorCode.BAD_REQUEST,
        message: 'old token rejected',
        status: 400,
      }),
    );
    await flush();
    expect(post.mock.calls.map((call) => call[1].pushToken)).toEqual([
      'customer-native-token-1',
      'customer-native-token-2',
    ]);
  });

  it('stops uploads and retries when the customer session ends', async () => {
    post.mockRejectedValue(createApiError({ code: ApiErrorCode.NETWORK, message: 'offline' }));
    const controller = start();
    await flush();
    controller.stop();
    tokenListener({ type: 'android', data: 'late-token' });
    await jest.advanceTimersByTimeAsync(60000);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('skips registration when the authenticated customer has changed', async () => {
    start(async () => null);
    await flush();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not register when notification permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    start();
    await flush();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps iOS using Expo delivery rather than uploading an APNs token as FCM', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    nativeToken.mockResolvedValue({ type: 'ios', data: 'customer-apns-token' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExpoPushToken[customer-ios]',
    });
    start();
    await flush();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({
      provider: 'expo',
      platform: 'ios',
      pushToken: 'ExpoPushToken[customer-ios]',
    });
  });
});
