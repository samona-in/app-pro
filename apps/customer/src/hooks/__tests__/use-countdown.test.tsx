import { act, renderHook } from '@testing-library/react-native';
import { useCountdown } from '../use-countdown';

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts counting down as soon as it mounts', () => {
    const { result } = renderHook(() => useCountdown(30_000));

    expect(result.current.isActive).toBe(true);
    expect(result.current.remainingSeconds).toBe(30);

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(result.current.remainingSeconds).toBe(20);
  });

  it('stops being active once the window is over', () => {
    const { result } = renderHook(() => useCountdown(1_000));

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
  });

  it('restarts the full window on demand', () => {
    const { result } = renderHook(() => useCountdown(30_000));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current.isActive).toBe(false);

    act(() => {
      result.current.restart();
    });
    expect(result.current.isActive).toBe(true);
    expect(result.current.remainingSeconds).toBe(30);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.remainingSeconds).toBe(25);
  });

  it('rounds up so a partially elapsed second still reads as time left', () => {
    const { result } = renderHook(() => useCountdown(30_000));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.remainingSeconds).toBe(30);
    expect(result.current.isActive).toBe(true);
  });
});
