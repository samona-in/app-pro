import { LOCATION_DEFAULTS } from '@samona/config';

/** Whole-kilometre bounds the slider must never leave. */
export const MIN_SERVICE_RADIUS_KM = LOCATION_DEFAULTS.minServiceRadiusKm;
export const MAX_SERVICE_RADIUS_KM = LOCATION_DEFAULTS.maxServiceRadiusKm;

export type RadiusSaveDecision =
  { shouldSave: true } | { shouldSave: false; reason: 'same-value' | 'in-flight' };

/**
 * Whether releasing the slider should hit the network.
 *
 * Releasing on the value already saved is a no-op by definition, and a request
 * already in flight means another release must not stack — the gesture is
 * disabled while saving anyway, this guards the a11y path and races.
 */
export function decideRadiusSave(
  next: number,
  current: number,
  inFlight: boolean,
): RadiusSaveDecision {
  if (inFlight) return { shouldSave: false, reason: 'in-flight' };
  if (next === current) return { shouldSave: false, reason: 'same-value' };
  return { shouldSave: true };
}
