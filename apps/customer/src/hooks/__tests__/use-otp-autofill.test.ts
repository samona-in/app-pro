import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import {
  extractOtpCode,
  startOtpListening,
  stopOtpListening,
  useOtpAutoFill,
} from '../use-otp-autofill';

/**
 * Native listeners the bus installed, by event name; tests emit into these
 * the way Play Services would.
 */
const mockNativeListeners: Record<string, Array<(event: { message: string }) => void>> = {};

jest.mock('expo-otp-autofill', () => ({
  addListener: (eventName: string, listener: (event: { message: string }) => void) => {
    if (!mockNativeListeners[eventName]) mockNativeListeners[eventName] = [];
    mockNativeListeners[eventName].push(listener);
    return {
      remove: () => {
        const bucket = mockNativeListeners[eventName];
        if (!bucket) return;
        const index = bucket.indexOf(listener);
        if (index >= 0) bucket.splice(index, 1);
      },
    };
  },
  startSmsRetrieverAsync: jest.fn().mockResolvedValue(true),
  stopSmsRetrieverAsync: jest.fn().mockResolvedValue(undefined),
  getAppHashAsync: jest.fn().mockResolvedValue(''),
}));

// The mocked native module, exactly as the hook's lazy require resolves it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = require('expo-otp-autofill') as {
  startSmsRetrieverAsync: jest.Mock;
  stopSmsRetrieverAsync: jest.Mock;
};

/** Emits an SMS the way the Retriever broadcast would deliver it. */
function emitSms(message: string) {
  for (const listener of [...(mockNativeListeners.onOtpReceived ?? [])]) {
    listener({ message });
  }
}

/** Emits Play Services' five-minute timeout. */
function emitTimeout() {
  for (const listener of [...(mockNativeListeners.onOtpError ?? [])]) {
    listener({ message: 'Timeout waiting for SMS' });
  }
}

const realOS = Platform.OS;
/** Pinned wall clock: the bus compares message and arming timestamps, and
 * real Date.now() calls inside one test can land on the same millisecond. */
let now: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  now = jest.spyOn(Date, 'now');
  now.mockReturnValue(0);
});

afterAll(() => {
  Platform.OS = realOS;
  jest.restoreAllMocks();
});

describe('extractOtpCode', () => {
  it('prefers the code following a keyword', () => {
    expect(extractOtpCode('SAMONA: your code is 482913. Do not share.', 6)).toBe('482913');
  });

  it('matches keyword variants case-insensitively', () => {
    expect(extractOtpCode('Your OTP is 551204', 6)).toBe('551204');
    expect(extractOtpCode('Passcode 9031 expires in 10 minutes', 4)).toBe('9031');
  });

  it('falls back to an isolated digit group without a keyword', () => {
    expect(extractOtpCode('482913 is your SAMONA verification', 6)).toBe('482913');
  });

  it('ignores digit runs longer than the expected length', () => {
    expect(extractOtpCode('Order 1234567890 shipped, code 771209', 6)).toBe('771209');
    expect(extractOtpCode('123456789012', 6)).toBeNull();
  });

  it('returns null when no code of the right length exists', () => {
    expect(extractOtpCode('Welcome to SAMONA!', 6)).toBeNull();
    expect(extractOtpCode('', 4)).toBeNull();
  });

  it('reads the code out of the production SMS template', () => {
    expect(
      extractOtpCode('Your SAMONA verification code is 4826.\n\nmqbDHIJEYKA\nlSIAglKzhjG', 4),
    ).toBe('4826');
  });
});

describe('sms retriever bus', () => {
  it('arms the retriever when listening starts', async () => {
    await stopOtpListening();
    native.startSmsRetrieverAsync.mockClear();

    await startOtpListening();

    expect(native.startSmsRetrieverAsync).toHaveBeenCalledTimes(1);
  });

  it('installs one process-wide listener, not one per start', async () => {
    await startOtpListening();
    await startOtpListening();

    expect(mockNativeListeners.onOtpReceived).toHaveLength(1);
    expect(mockNativeListeners.onOtpError).toHaveLength(1);
  });

  it('delivers a caught SMS to a mounted hook, then re-arms for a resend', async () => {
    await stopOtpListening();
    now.mockReturnValue(1_000);
    await startOtpListening();
    native.startSmsRetrieverAsync.mockClear();

    const onOtpReceived = jest.fn();
    const { result } = renderHook(() => useOtpAutoFill({ length: 4, onOtpReceived }));

    now.mockReturnValue(2_000);
    act(() => {
      emitSms('Your SAMONA verification code is 4826.\n\nmqbDHIJEYKA\nlSIAglKzhjG');
    });

    expect(onOtpReceived).toHaveBeenCalledWith('4826');
    expect(result.current.otp).toBe('4826');
    // The arm just consumed its one SMS; the bus renews it.
    expect(native.startSmsRetrieverAsync).toHaveBeenCalledTimes(1);
  });

  it('delivers an SMS that arrived while no hook was mounted', async () => {
    await stopOtpListening();
    now.mockReturnValue(3_000);
    await startOtpListening();

    now.mockReturnValue(4_000);
    emitSms('Your SAMONA verification code is 1111. mqbDHIJEYKA');

    const onOtpReceived = jest.fn();
    renderHook(() => useOtpAutoFill({ length: 4, onOtpReceived }));

    expect(onOtpReceived).toHaveBeenCalledWith('1111');
  });

  it('never delivers a message from before the retriever was armed', async () => {
    await stopOtpListening();
    now.mockReturnValue(5_000);
    emitSms('Your SAMONA verification code is 2222. mqbDHIJEYKA');

    now.mockReturnValue(6_000);
    await startOtpListening();

    const onOtpReceived = jest.fn();
    renderHook(() => useOtpAutoFill({ length: 4, onOtpReceived }));

    expect(onOtpReceived).not.toHaveBeenCalled();
  });

  it('re-arms when Play Services times out, but not once stopped', async () => {
    await stopOtpListening();
    now.mockReturnValue(7_000);
    await startOtpListening();
    native.startSmsRetrieverAsync.mockClear();

    emitTimeout();
    expect(native.startSmsRetrieverAsync).toHaveBeenCalledTimes(1);

    await stopOtpListening();
    native.startSmsRetrieverAsync.mockClear();
    emitTimeout();
    expect(native.startSmsRetrieverAsync).not.toHaveBeenCalled();
  });

  it('arms itself when no screen armed the retriever (direct verify entry)', async () => {
    await stopOtpListening();
    native.startSmsRetrieverAsync.mockClear();

    renderHook(() => useOtpAutoFill({ length: 4 }));

    expect(native.startSmsRetrieverAsync).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the screen goes away', async () => {
    await stopOtpListening();
    native.stopSmsRetrieverAsync.mockClear();

    const { unmount } = renderHook(() => useOtpAutoFill({ length: 4 }));
    unmount();

    expect(native.stopSmsRetrieverAsync).toHaveBeenCalledTimes(1);
  });

  it('is a no-op off Android', async () => {
    Platform.OS = 'ios';
    native.startSmsRetrieverAsync.mockClear();
    native.stopSmsRetrieverAsync.mockClear();

    await startOtpListening();
    await stopOtpListening();
    renderHook(() => useOtpAutoFill({ length: 4, onOtpReceived: jest.fn() }));

    expect(native.startSmsRetrieverAsync).not.toHaveBeenCalled();
    expect(native.stopSmsRetrieverAsync).not.toHaveBeenCalled();
  });
});
