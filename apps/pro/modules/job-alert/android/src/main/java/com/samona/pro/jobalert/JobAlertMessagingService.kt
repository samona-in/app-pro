package com.samona.pro.jobalert

import android.app.Application
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

private const val NEW_JOB_TYPE = "NEW_JOB"
private const val ASSIGNED_CANCELLATION_TYPE = "JOB_CANCELLED_ASSIGNED"
private val TERMINAL_JOB_DATA_TYPES = setOf("JOB_ACCEPTED", "JOB_CANCELLED", "JOB_EXPIRED")

/**
 * The pro-side job-alert push handler (higher priority than expo-notifications'
 * MESSAGING_EVENT handler, so NEW_JOB pushes land here).
 *
 * NEW_JOB — persist to [AlertStore], then present in exactly one tier,
 * strongest first, so a request raises over whatever the pro is doing — in the
 * foreground, backgrounded or killed:
 *
 *  1. "display over other apps" granted → [JobAlertOverlay] banner + the
 *     native looping alarm (offer window, 90s by default). The overlay wakes a screen-off device and
 *     carries Accept/Reject, which redeem the single-use offer token directly
 *     over the API; no tray entry is posted, so the overlay and its ring are
 *     the entire presentation for this tier.
 *  2. full-screen intent usable (Android ≤13, or the granted 14+ role) → the
 *     system covers the screen with the `job-alert/[id]` route; the channel's
 *     looping sound plays once.
 *  3. otherwise → the MAX head-up tray entry (with Accept/Reject actions)
 *     remains tappable.
 *
 * The native overlay is the single presentation for a NEW_JOB request in every
 * app state. There is no separate in-app (JS) ring anymore, so the app being
 * in the foreground is not a reason to skip it — an open pro needs the same
 * request they would get while backgrounded.
 *
 * Terminal messages (JOB_ACCEPTED / JOB_CANCELLED / JOB_EXPIRED) cancel the
 * native alert for that job: sound, overlay and tray. These are data-only, so
 * they only arrive while the process is alive; a dead-process tray left behind
 * resolves server-side (fetch → unavailable) once the pro opens it.
 *
 * Every other message is handed to the superclass so Expo's foreground and
 * background handling and the FCM token flow keep working unchanged.
 */
class JobAlertMessagingService : ExpoFirebaseMessagingService() {
  override fun onCreate() {
    super.onCreate()
    (application as? Application)?.let(AppForeground::register)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val type = data["type"]
    val jobId = data["jobId"]
    Log.i(
      JOB_ALERT_TAG,
      "onMessageReceived id=${remoteMessage.messageId} from=${remoteMessage.from} " +
        "notification=${remoteMessage.notification != null} " +
        "keys=${data.keys.joinToString(",")} type=$type jobId=$jobId",
    )

    if (type == NEW_JOB_TYPE && !jobId.isNullOrBlank()) {
      try {
        handleNewJob(jobId, data)
      } catch (t: Throwable) {
        // Never let the alert die silently: log, then post the plainest loud
        // tray notification as a fallback so the pro still sees it.
        Log.e(JOB_ALERT_TAG, "Job alert failed for $jobId", t)
        AlertNotifications.ensureChannel(this)
        AlertNotifications.postAlert(this, IncomingJobAlert.fromFcmData(jobId, data, System.currentTimeMillis()), fullScreen = false)
      }
      // Deliberately do not call super: posting twice (ours + Expo's) would
      // raise two alerts for the same job.
      return
    }

    if (type == ASSIGNED_CANCELLATION_TYPE && !jobId.isNullOrBlank()) {
      try {
        handleAssignedCancellation(jobId, data["cancelledAt"].orEmpty())
      } catch (t: Throwable) {
        Log.e(JOB_ALERT_TAG, "Assigned-cancellation handling failed for $jobId", t)
      }
      return
    }

    if (type in TERMINAL_JOB_DATA_TYPES && !jobId.isNullOrBlank()) {
      try {
        handleTerminal(jobId)
      } catch (t: Throwable) {
        Log.e(JOB_ALERT_TAG, "Terminal handling failed for $jobId", t)
      }
      return
    }

    super.onMessageReceived(remoteMessage)
  }

  private fun handleNewJob(jobId: String, data: Map<String, String>) {
    val alert = IncomingJobAlert.fromFcmData(jobId, data, System.currentTimeMillis())
    AlertStore(this).addOrReplace(alert)

    AlertNotifications.ensureChannel(this)
    if (Settings.canDrawOverlays(this)) {
      // Explicit user grant: the overlay and its looping alarm are the entire
      // presentation — no tray entry competes with them. The overlay wakes a
      // screen-off device (FLAG_TURN_SCREEN_ON) and carries Accept/Decline, so
      // this tier needs no notification at all and does not even require the
      // notification permission. A full-screen intent would raise the same
      // route without the grant, so it is only the fallback where the overlay
      // permission is missing. Shown for any app state — backgrounded, killed
      // and foreground alike. Reconcile keeps the banner in step with the
      // pending set and the ring with the pending count: the banner is skipped
      // on the incoming-jobs screen (suppressed), the ring always follows the
      // count. The banner and countdown both run for the server-minted offer
      // window (`offerExpiresAt`, 90s by default).
      JobAlertOverlay.reconcile(this, AlertStore(this))
      return
    }
    if (NotificationManagerCompat.from(this).areNotificationsEnabled()) {
      val fullScreenUsable =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
          NotificationManagerCompat.from(this).canUseFullScreenIntent()
      if (fullScreenUsable) {
        AlertNotifications.postAlert(this, alert, fullScreen = true)
        return
      }

      AlertNotifications.postAlert(this, alert, fullScreen = false)
    } else {
      Log.w(JOB_ALERT_TAG, "Notifications off — alert for $jobId only stored")
    }
  }

  private fun handleAssignedCancellation(jobId: String, cancelledAt: String) {
    val store = AlertStore(this)
    val isNew = store.setAssignmentCancellation(jobId, cancelledAt)
    if (!isNew) {
      // The socket already raised this cancellation in-process — the single
      // alert rule: one vibration, one tray entry, one modal.
      Log.i(JOB_ALERT_TAG, "Cancellation for job $jobId already raised — skipping push")
      return
    }
    JobAlertCancellation.present(this, jobId)
    AlertNotifications.postAssignmentCancellation(this, jobId)
    Log.i(JOB_ALERT_TAG, "Raised cancellation alert for job $jobId")
  }

  private fun handleTerminal(jobId: String) {
    AlertStore(this).clearJob(jobId)
    // The ring follows the remaining pending count, so terminal states for one
    // offer never silence a still-pending request; the banner is re-presented
    // for what remains unless the pro is on the incoming-jobs screen.
    JobAlertOverlay.reconcile(this, AlertStore(this))
    AlertNotifications.cancel(this, jobId)
    Log.i(JOB_ALERT_TAG, "Cleared native alert for job $jobId")
  }
}