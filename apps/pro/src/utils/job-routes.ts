import { isActiveJobStatus, isSettlementPendingStatus, type JobStatus } from '@samona/types';

/**
 * The route the pro belongs on right now, or null when they belong on home.
 *
 * Money owed always wins: a completed but unpaid job (COMPLETED / PAYMENT_PENDING)
 * must be settled — by the pro's own "Collect cash" swipe — before any accepted
 * job can take them to the map. This single, monotonic rule drives every
 * auto-redirect (cold start, home focus, the native job-alert deep link) so a pro
 * can never be pulled off the payment screen while cash is still owed on a job
 * they already finished.
 */
export function occupiedJobRoute(
  jobs: readonly { id: string; status: JobStatus }[],
): string | null {
  const payment = jobs.find((job) => isSettlementPendingStatus(job.status));
  if (payment) return `/job/${payment.id}/pay`;
  const active = jobs.find((job) => isActiveJobStatus(job.status));
  if (active) return `/job/${active.id}/active`;
  return null;
}
