import { Platform, Vibration } from 'react-native';

/**
 * The finite repeating vibration for a customer-cancelled job.
 *
 * A 9.6s repeating pattern — 12 × (600ms on / 200ms off) after an initial
 * 0ms — never one long uninterrupted buzz, so a muted phone still pulses and a
 * phone the pro is holding tells them one job went away. The ~10s ceiling is a
 * cap on the *vibration* only; the alert stays up — the modal — until the pro
 * acknowledges.
 *
 * Android is deliberately absent here: the native `JobAlertCancellation` ring
 * already owns the vibration on Android (with the same duration contract), and
 * the native store's `isNew` result is the single deduplication anchor across
 * socket and push. This util only covers surfaces without the native module
 * (iOS), where the RN `Vibration` API is the fallback.
 */

/** 12 pulses after the initial 0ms wait: sum ≈ 9.6s. */
export const CANCELLED_VIBRATION_PATTERN = [
  0, 600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600, 200,
  600, 200, 600, 200, 600, 200,
];

export function startCancellationVibration(): void {
  if (Platform.OS === 'android') return;
  Vibration.vibrate(CANCELLED_VIBRATION_PATTERN, false);
}

export function stopCancellationVibration(): void {
  if (Platform.OS === 'android') return;
  Vibration.cancel();
}