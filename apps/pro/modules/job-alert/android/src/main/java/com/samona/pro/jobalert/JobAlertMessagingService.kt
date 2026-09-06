package com.samona.pro.jobalert

import android.app.Application
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

private const val NEW_JOB_TYPE = "NEW_JOB"
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
 *     native looping alarm (10 s) + a silent MAX head-up tray entry (kept so a
 *     screen-off device wakes and the request survives the overlay's auto-
 *     dismiss; it makes no sound of its own — the looping alarm is the single
 *     ring). The overlay's Accept/Reject redeem the single-use offer token
 *     directly over the API.
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
    if (NotificationManagerCompat.from(this).areNotificationsEnabled()) {
      val fullScreenUsable =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
          NotificationManagerCompat.from(this).canUseFullScreenIntent()
      if (Settings.canDrawOverlays(this)) {
        // Explicit user grant, so the only tier that draws over any app comes
        // first: banner + looping alarm + a SILENT MAX head-up tray. The
        // heads-up keeps waking a screen-off device and leaves a durable
        // Accept/Decline surface after the overlay auto-dismisses; its own
        // chime is suppressed because JobAlertSound already rings — two alarms
        // for one request would defeat the point. A full-screen intent would
        // raise exactly the same route over the same screen without needing
        // the grant, so it is only the fallback on devices where the overlay
        // permission is missing. Shown for any app state — backgrounded,
        // killed and foreground alike.
        AlertNotifications.postAlert(this, alert, fullScreen = false, silent = true)
        JobAlertSound.start(this)
        JobAlertOverlay.show(this, alert)
        return
      }
      if (fullScreenUsable) {
        AlertNotifications.postAlert(this, alert, fullScreen = true)
        return
      }

      AlertNotifications.postAlert(this, alert, fullScreen = false)
    } else {
      Log.w(JOB_ALERT_TAG, "Notifications off — alert for $jobId only stored")
    }
  }

  private fun handleTerminal(jobId: String) {
    AlertStore(this).clearJob(jobId)
    JobAlertOverlay.hide(jobId)
    JobAlertSound.stop()
    AlertNotifications.cancel(this, jobId)
    Log.i(JOB_ALERT_TAG, "Cleared native alert for job $jobId")
  }
}