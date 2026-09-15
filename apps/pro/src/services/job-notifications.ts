import { clearNativeJobAlert, consumeNativePendingAction } from './overlay-alert';
import { offerActions } from './offer-actions';

/**
 * Coordinates the native Android job-alert layer with the app.
 *
 * Job-request *presentation* is fully native now: the Android overlay/full-
 * screen/tray raises every NEW_JOB push in every app state, so no JS ring
 * exists anymore. What JS still owns is the one seam only the app can touch:
 *
 *  - Executing an Accept/Decline a pro tapped on the native overlay when the
 *    push carried no signed offer token (with a token the overlay redeems the
 *    job over the API by itself and never launches the app). The deep link
 *    `job-alert/[id]?action=` carries the recorded choice here with the token
 *    the app alone holds.
 *
 * The decisions themselves are executed through `offerActions`, the same
 * shared Accept/Decline the incoming-jobs screen uses, so a decline recorded by
 * the native overlay removes the offer from the global pending collection —
 * and every surface reading it — the moment the server confirms it.
 */
function createJobNotificationService() {
  /**
   * Executes the accept/decline a pro tapped on the native overlay banner.
   *
   * The native button only records the choice, stops the alarm and opens the
   * app; this is where the authorized API call actually runs — single-tap UX
   * with the token held only by the app. Called from the `job-alert/:id` route
   * with the action it was deep-linked with; any recorded action still present
   * is consumed so nothing ever double-executes.
   */
  async function resolveNativePendingAction(
    jobId: string,
    action: 'accept' | 'decline',
  ): Promise<void> {
    // Clear whatever the native side recorded first, so a later boot/resume can
    // never re-run this decision. `offerActions` swallows per-job errors: the
    // store still converges (accept failure drops the offer as terminal, decline
    // failure keeps it for a retry).
    await consumeNativePendingAction();

    if (action === 'accept') {
      await offerActions.accept(jobId);
    } else {
      await offerActions.decline(jobId);
    }

    // Safety net for an alert the JS store never mirrored (e.g. a stale tray
    // entry for a job this device never populated): the store removal cascades
    // the native clear, but only for offers it actually held.
    void clearNativeJobAlert(jobId);
  }

  return {
    resolveNativePendingAction,
  };
}

export const jobNotificationService = createJobNotificationService();
