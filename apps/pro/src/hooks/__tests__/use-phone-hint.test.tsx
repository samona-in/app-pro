import { act, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as PhoneNumberHint from 'expo-phone-number-hint';
import { PHONE_HINT_DELAY_MS, usePhoneHint } from '../use-phone-hint';

jest.mock('expo-phone-number-hint', () => ({
  isAvailableAsync: jest.fn(),
  showPhoneNumberHintAsync: jest.fn(),
}));

function renderHook(onPick: (phone: string) => void, isEnabled: boolean) {
  const Probe = () => {
    usePhoneHint(onPick, isEnabled);
    return null;
  };
  return render(<Probe />);
}

describe('usePhoneHint', () => {
  const isAvailable = PhoneNumberHint.isAvailableAsync as jest.Mock;
  const showHint = PhoneNumberHint.showPhoneNumberHintAsync as jest.Mock;
  const onPick = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    onPick.mockClear();
    isAvailable.mockReset().mockResolvedValue(true);
    showHint.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function platform(os: 'android' | 'ios') {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }

  it('offers a picked SIM number to the caller', async () => {
    platform('android');
    showHint.mockResolvedValue({ canceled: false, hint: { e164: '+919876543210' } });

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(onPick).toHaveBeenCalledWith('+919876543210');
  });

  it('falls back to the raw number when E.164 cannot be derived', async () => {
    platform('android');
    showHint.mockResolvedValue({ canceled: false, hint: { e164: null, number: '9876543210' } });

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(onPick).toHaveBeenCalledWith('9876543210');
  });

  it('does nothing when the picker is dismissed', async () => {
    platform('android');
    showHint.mockResolvedValue({ canceled: true, hint: null });

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('does not prompt on iOS — there is no equivalent API', async () => {
    platform('ios');

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(isAvailable).not.toHaveBeenCalled();
    expect(showHint).not.toHaveBeenCalled();
  });

  it('stays out of the way while the Pro types their own number', () => {
    platform('android');

    renderHook(onPick, false);
    jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);

    expect(showHint).not.toHaveBeenCalled();
  });

  it('degrades silently when Play Services are unavailable or the module is missing', async () => {
    platform('android');
    isAvailable.mockRejectedValue(new Error('native module missing'));

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(onPick).not.toHaveBeenCalled();
  });

  /**
   * Expo Go has no compiled native side: requiring the package yields an
   * unusable module. The hook must treat that like any other failure instead
   * of crashing the route.
   */
  it('degrades silently when the module loads without its native counterpart', async () => {
    platform('android');
    isAvailable.mockRejectedValue(new Error("Cannot find native module 'ExpoPhoneNumberHint'"));

    renderHook(onPick, true);
    await act(async () => {
      jest.advanceTimersByTime(PHONE_HINT_DELAY_MS);
    });

    expect(showHint).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
