import { renderHook } from '@testing-library/react-native';
import { startOtpListening, stopOtpListening, useOtpAutoFill } from '../use-otp-autofill';

/**
 * No mock for `expo-otp-autofill` in this file: Jest cannot load the native
 * module, which is exactly the situation on iOS and in Expo Go, so these
 * tests pin the "fall back to manual entry" behaviour of the lazy loader.
 */
describe('otp autofill without the native module', () => {
  it('keeps the hook inert', () => {
    const onOtpReceived = jest.fn();
    const { result } = renderHook(() => useOtpAutoFill({ length: 4, onOtpReceived }));

    expect(result.current.otp).toBeNull();
    expect(onOtpReceived).not.toHaveBeenCalled();
  });

  it('keeps start and stop safe no-ops', async () => {
    await expect(startOtpListening()).resolves.toBeUndefined();
    await expect(stopOtpListening()).resolves.toBeUndefined();
  });
});
