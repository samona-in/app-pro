import { JOB_DEFAULTS } from '@samona/config';

/**
 * Distance heuristics for matching and job presentation.
 *
 * Intentional approximations: haversine over plumb altitudes, radius as the
 * crow flies, ETA as speed × distance. A driving-time API can replace these
 * later without touching the call sites.
 */

export { distanceKm } from '@samona/config';

/** Minutes a pro should expect to reach the request at the configured speed. */
export function etaMinutes(distanceKmValue: number): number {
  if (distanceKmValue <= 0) return 1;
  const minutes = (distanceKmValue / JOB_DEFAULTS.etaSpeedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}
