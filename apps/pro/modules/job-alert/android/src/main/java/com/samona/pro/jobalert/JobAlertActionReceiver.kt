package com.samona.pro.jobalert

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

/**
 * Handles the Accept/Reject tap from the [JobAlertOverlay] and the tray
 * notification's action buttons.
 *
 * When the alert carried a signed offer token, this performs the redemption
 * *natively* — the API is called right here, no app launch required, so the
 * pro can claim a job from the overlay before the app even comes up:
 *
 *  - HTTP 2xx → the offer was redeemed; drop the alert and (for accept) open
 *    the live job screen.
 *  - terminal (4xx except 429/408/425) → the offer is dead (already used,
 *    job taken/gone, or the token is invalid); drop the alert, stay put.
 *  - transient (429, 5xx, transport failure) → keep the alert in the tray and
 *    store so the repeating push or a manual repost can retry; the ringing has
 *    stopped, the pro already saw it.
 *
 * When the alert has no token (legacy push, or an Expo/older server), the same
 * pre-token path runs: record the choice, drop the native alert, open the app,
 * and let the in-app ring perform the authorized call.
 *
 * The receiver is kept alive across the network call with [goAsync]; the
 * background executor in [JobAlertApi] posts the result back on a worker
 * thread, which finishes the broadcast.
 */
class JobAlertActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra(EXTRA_ACTION)
    val jobId = intent.getStringExtra(EXTRA_JOB_ID)
    val offerToken = intent.getStringExtra(EXTRA_OFFER_TOKEN)
    if (action.isNullOrBlank() || jobId.isNullOrBlank()) {
      Log.w(JOB_ALERT_TAG, "Ignoring malformed alert action intent")
      return
    }

    val appContext = context.applicationContext
    val store = AlertStore(appContext)

    Log.i(
      JOB_ALERT_TAG,
      "Alert action=$action job=$jobId direct=${!offerToken.isNullOrBlank()}",
    )

    // The pro saw the alert and acted; stop ringing whatever happens next. The
    // store/tray are only cleared on an outcome, so a transient failure leaves
    // the alert actionable for the next repeat.
    JobAlertSound.stop()
    JobAlertOverlay.hide(jobId)

    if (offerToken.isNullOrBlank()) {
      // Legacy path: native code never held a token; hand the choice to the
      // in-app ring, which performs the authorized call once the app is up.
      store.setPendingAction(jobId, action)
      store.clearJob(jobId)
      AlertNotifications.cancel(appContext, jobId)
      launchJobAlertApp(appContext, jobId, action)
      return
    }

    val pending = goAsync()
    val safeToken = offerToken
    if (action == "accept") {
      JobAlertApi.accept(appContext, jobId, safeToken) { result ->
        settle(appContext, store, jobId, action, result, openJobOnSuccess = true, pending)
      }
    } else {
      JobAlertApi.reject(appContext, jobId, safeToken) { result ->
        settle(appContext, store, jobId, action, result, openJobOnSuccess = false, pending)
      }
    }
  }

  private fun settle(
    context: Context,
    store: AlertStore,
    jobId: String,
    action: String,
    result: JobAlertApi.Result,
    openJobOnSuccess: Boolean,
    pending: PendingResult,
  ) {
    try {
      when {
        result.ok -> {
          store.clearJob(jobId)
          AlertNotifications.cancel(context, jobId)
          if (openJobOnSuccess) launchJob(context, jobId)
        }

        !result.transient -> {
          // Terminal: nothing to retry — the offer is gone or already acted on.
          Log.i(JOB_ALERT_TAG, "Offer $action job=$jobId dead (HTTP ${result.code}); dropping alert")
          store.clearJob(jobId)
          AlertNotifications.cancel(context, jobId)
        }

        else -> {
          // Transient: keep the alert (tray + store); a repeat or repost retries.
          Log.w(JOB_ALERT_TAG, "Offer $action job=$jobId transient (HTTP ${result.code}); kept for retry")
        }
      }
    } finally {
      pending.finish()
    }
  }

  /** Opens the live job screen after a successful native accept. */
  private fun launchJob(context: Context, jobId: String) {
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse("$JOB_DEEP_LINK_PREFIX$jobId"))
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    runCatching { context.startActivity(intent) }.onFailure { t ->
      Log.w(JOB_ALERT_TAG, "Could not open job $jobId", t)
    }
  }

  /**
   * Opens `samonapro://job-alert/:id?action=accept|decline` on MainActivity
   * (the legacy path). The query param is a convenience for the route; the
   * authoritative choice is the one [AlertStore.consumePendingAction] delivers.
   */
  private fun launchJobAlertApp(context: Context, jobId: String, action: String) {
    val uri = Uri.parse("$JOB_ALERT_DEEP_LINK_PREFIX$jobId?action=$action")
    val intent =
      Intent(Intent.ACTION_VIEW, uri)
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
    runCatching { context.startActivity(intent) }.onFailure { t ->
      Log.w(JOB_ALERT_TAG, "Could not open app after overlay action ${jobId}", t)
    }
  }

  companion object {
    const val ACTION_ALERT_ACTION = "com.samona.pro.jobalert.ACTION_ALERT_ACTION"
    const val EXTRA_JOB_ID = "jobId"
    const val EXTRA_ACTION = "action"
    const val EXTRA_OFFER_TOKEN = "offerToken"
  }
}