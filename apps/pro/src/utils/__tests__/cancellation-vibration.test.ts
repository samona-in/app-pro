import { Vibration } from 'react-native';
import {
  CANCELLED_VIBRATION_PATTERN,
  startCancellationVibration,
  stopCancellationVibration,
} from '../cancellation-vibration';

describe('cancellation vibration', () => {
  beforeEach(() => {
    (Vibration.vibrate as jest.Mock).mockClear();
    (Vibration.cancel as jest.Mock).mockClear();
  });

  it('is a finite repeating pattern capped at ~10s', () => {
    const duration = CANCELLED_VIBRATION_PATTERN.reduce((sum, ms) => sum + ms, 0);
    expect(duration).toBeLessThanOrEqual(10_000);
    // More than a single long buzz — a real pulse so a muted phone still cues.
    expect(CANCELLED_VIBRATION_PATTERN.length).toBeGreaterThan(5);
  });

  it('plays the pattern once (repeat = false) rather than looping forever', () => {
    startCancellationVibration();
    expect(Vibration.vibrate).toHaveBeenCalledWith(CANCELLED_VIBRATION_PATTERN, false);
  });

  it('stops immediately on acknowledge', () => {
    stopCancellationVibration();
    expect(Vibration.cancel).toHaveBeenCalled();
  });
});