import { JOB_DEFAULTS } from '@samona/config';

/**
 * Distance heuristics for matching and job presentation.
 *
 * Intentional approximations: haversine over plumb altitudes, radius as the
 * crow flies, ETA as speed × distance. A driving-time API can replace these
 * later without touching the call sites.
 */

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres between two coordinates. */
export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Minutes a pro should expect to reach the request at the configured speed. */
export function etaMinutes(distanceKmValue: number): number {
  if (distanceKmValue <= 0) return 1;
  const minutes = (distanceKmValue / JOB_DEFAULTS.etaSpeedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}
