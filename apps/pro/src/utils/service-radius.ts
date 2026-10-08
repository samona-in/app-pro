import { LOCATION_DEFAULTS } from '@samona/config';

/** Whole-kilometre bounds the slider must never leave. */
export const MIN_SERVICE_RADIUS_KM = LOCATION_DEFAULTS.minServiceRadiusKm;
export const MAX_SERVICE_RADIUS_KM = LOCATION_DEFAULTS.maxServiceRadiusKm;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maps a radius (km) onto the knob's travel range for a given track length.
 *
 * The travel range is the distance the knob can actually move — the track
 * minus the knob's own width. A negative or zero travel (track not measured
 * yet) pins the knob at the start.
 */
export function translateFromValue(
  value: number,
  min: number,
  max: number,
  travel: number,
): number {
  if (travel <= 0) return 0;
  return ((clamp(value, min, max) - min) / (max - min || 1)) * travel;
}

/**
 * Maps a knob position back to the nearest whole-kilometre radius.
 *
 * Matching compares whole kilometres (`distanceKm <= serviceRadiusKm`), so the
 * slider must only ever offer whole numbers.
 */
export function valueFromTranslate(
  translate: number,
  min: number,
  max: number,
  travel: number,
): number {
  if (travel <= 0) return min;
  const fraction = clamp(translate, 0, travel) / travel;
  return Math.round(min + fraction * (max - min || 1));
}

export type RadiusSaveDecision =
  | { shouldSave: true }
  | { shouldSave: false; reason: 'same-value' | 'in-flight' };

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