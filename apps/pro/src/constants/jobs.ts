import { JobStatus, type JobStatus as Status } from '@samona/types';

/**
 * Statuses where the pro is heading to the customer.
 *
 * While a job is in either of these states the Pro app redirects away from the
 * home screen into the map-first trip screen, which owns ACCEPTED → TRAVELLING
 * → ARRIVED. Once the pro arrives, the standard job-timeline screen takes over.
 */
export const TRIP_STATUSES: readonly Status[] = [JobStatus.ACCEPTED, JobStatus.TRAVELLING];

export function isTripStatus(status: Status): boolean {
  return (TRIP_STATUSES as readonly Status[]).includes(status);
}
