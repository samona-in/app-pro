package com.samona.pro.jobalert

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

/**
 * Accepts the Accept/Decline tap from the [JobAlertOverlay].
 *
 * Records the pro's choice in the [AlertStore] (consumePendingAction), clears
 * the native alert for the job (sound, overlay, tray), and opens the app so
 * the in-app ring performs the *secured* API call — native code never touches
 * the token. Launching from here is allowed because the overlay only appears
 * when the pro granted "display over other apps", and an app holding
 * SYSTEM_ALERT_WINDOW is exempt from Android 10+ background activity-start
 * restrictions.
 */
class JobAlertActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra(EXTRA_ACTION)
    val jobId = intent.getStringExtra(EXTRA_JOB_ID)
    if (action.isNullOrBlank() || jobId.isNullOrBlank()) return

    Log.i(JOB_ALERT_TAG, "Overlay action=${action} job=$jobId")

    val store = AlertStore(context)
    store.setPendingAction(jobId, action)
    store.clearJob(jobId)

    JobAlertSound.stop()
    JobAlertOverlay.hide(jobId)
    AlertNotifications.cancel(context, jobId)

    launchJobAlertApp(context, jobId, action)
  }

  /**
   * Opens `samonapro://job-alert/:id?action=accept|decline` on MainActivity.
   * The query param is a convenience for the route; the authoritative choice
   * is the one [AlertStore.consumePendingAction] delivers on resume.
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
  }
}