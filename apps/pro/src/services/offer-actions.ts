import { jobsApi } from './jobs';
import { useIncomingOffersStore } from '@/stores/incoming-offers';

/**
 * Shared Accept/Decline for a pending job offer.
 *
 * Every surface that answers an offer — the incoming-jobs screen cards and the
 * native overlay's no-token deep link — funnels through here so the pending
 * collection is updated exactly once per decision, from the moment the server
 * confirms it:
 *
 *  - a successful decline removes only that job from the global pending-offers
 *    store (which also clears its native alert);
 *  - a successful accept clears the whole collection — claiming one job makes
 *    every other pending offer moot;
 *  - a failed accept drops just that job (it is terminal for this pro: taken
 *    or expired), while a failed decline keeps it — the pro still owns the
 *    window and can retry.
 *
 * Removing is never optimistic: the API call settles first, so a failed
 * decline can never quietly lose the offer, and the store's `remove` is
 * idempotent, so a realtime event racing a decision is a harmless no-op.
 * The per-job in-flight guard also blocks duplicate taps coming from two
 * surfaces at once; the server's decline is idempotent as a backstop.
 */

export type OfferActionResult =
  { status: 'done' } | { status: 'busy' } | { status: 'error'; error: unknown };

interface OfferActionService {
  decline: (jobId: string) => Promise<OfferActionResult>;
  accept: (jobId: string) => Promise<OfferActionResult>;
}

function createOfferActions(): OfferActionService {
  const inFlight = new Set<string>();

  async function decline(jobId: string): Promise<OfferActionResult> {
    if (inFlight.has(jobId)) return { status: 'busy' };
    inFlight.add(jobId);
    try {
      await jobsApi.decline(jobId);
      useIncomingOffersStore.getState().remove(jobId);
      return { status: 'done' };
    } catch (error) {
      return { status: 'error', error };
    } finally {
      inFlight.delete(jobId);
    }
  }

  async function accept(jobId: string): Promise<OfferActionResult> {
    if (inFlight.has(jobId)) return { status: 'busy' };
    inFlight.add(jobId);
    try {
      await jobsApi.accept(jobId);
      useIncomingOffersStore.getState().clearAll();
      return { status: 'done' };
    } catch (error) {
      useIncomingOffersStore.getState().remove(jobId);
      return { status: 'error', error };
    } finally {
      inFlight.delete(jobId);
    }
  }

  return { decline, accept };
}

export const offerActions = createOfferActions();
