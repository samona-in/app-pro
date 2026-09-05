package com.samona.pro.jobalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.util.Log
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

private const val JOB_ALERT_CHANNEL = "job-alerts"
private const val NEW_JOB_TYPE = "NEW_JOB"
private const val JOB_ALERT_DEEP_LINK_PREFIX = "samonapro://job-alert/"
private const val DEFAULT_TITLE = "New job request"
private const val DEFAULT_BODY = "A customer nearby needs your services."
private const val TAG = "SamonaJobAlert"

/**
 * The pro-side job-alert push handler.
 *
 * FCM delivers each message to the single resolved MESSAGING_EVENT service,
 * and our manifest declares this one with a higher priority than
 * expo-notifications' default handler, so NEW_JOB pushes land here. That lets a
 * job request raise over whatever the pro is doing:
 *
 *  - `setFullScreenIntent(..., true)` launches MainActivity on top of the
 *    current app the moment the alert fires (the React overlay then shows the
 *    accept/reject ring via the `job-alert/[id]` route).
 *  - While the app is backgrounded (recents or swiped away — the online
 *    foreground service keeps the process alive), the push also auto-launches
 *    the same screen so the ring appears without the pro tapping the alert or
 *    waiting for the app to load ([launchJobAlertIfBackgrounded]).
 *  - Every other message is handed to the superclass, so Expo's foreground and
 *    background handling, and the FCM token flow, keep working as before.
 *
 * A separate NotificationManager channel ("job-alerts") backend, matching the
 * one `ensureChannel()` creates from JS, is used so the alert is loud, audible
 * and DND-bypassing even if a notification arrives before the app ever opened.
 */
class FullScreenJobAlertMessagingService : ExpoFirebaseMessagingService() {
  override fun onCreate() {
    super.onCreate()
    // Keep the foreground flag accurate so a push knows whether to auto-bring
    // the app forward (or leave the already-on-screen ring alone).
    (application as? android.app.Application)?.let(AppForeground::register)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val type = data["type"]
    val jobId = data["jobId"]
    Log.i(
      TAG,
      "onMessageReceived id=${remoteMessage.messageId} from=${remoteMessage.from} " +
        "notification=${remoteMessage.notification != null} " +
        "keys=${data.keys.joinToString(",")} type=$type jobId=$jobId " +
        "body=${data["body"]?.take(600)}",
    );

    if (type == NEW_JOB_TYPE && !jobId.isNullOrBlank()) {
      try {
        showFullScreenJobAlert(remoteMessage, jobId, data)
      } catch (t: Throwable) {
        // Never let the alert die silently: log it, then post the plainest
        // possible tray notification as a fallback so the pro still sees it.
        Log.e(TAG, "Full-screen alert failed for job $jobId", t)
        postFallbackAlert(remoteMessage, jobId)
      }
      // Surface the ring without asking the pro to tap: the process is alive
      // (online foreground service), so the app comes forward with the request
      // already ringing. The FSI notification above is kept as the guaranteed
      // fallback when this launch is blocked.
      launchJobAlertIfBackgrounded(jobId)
      // Deliberately do not call super: posting the notification twice (ours +
      // Expo's) would raise two alerts for the same job.
      return
    }

    super.onMessageReceived(remoteMessage)
  }

  /**
   * The activity that shows the request. Fires over whatever the pro is doing
   * via `samonapro://job-alert/:id`, which expo-router resolves to the ring.
   */
  private fun buildOpenIntent(jobId: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("$JOB_ALERT_DEEP_LINK_PREFIX$jobId")).apply {
      component = ComponentName(packageName, "$packageName.MainActivity")
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP,
      )
    }

  /**
   * Best-effort auto-launch of the job-request screen when the app is not in
   * the foreground. Android restricts background activity starts, but a freshly
   * posted full-screen-intent notification grants the launch exemption — which
   * is why this is called after [showFullScreenJobAlert]. Failing that, the
   * notification itself remains tappable.
   */
  private fun launchJobAlertIfBackgrounded(jobId: String) {
    if (AppForeground.isForeground) return
    try {
      startActivity(buildOpenIntent(jobId))
      Log.i(TAG, "Auto-launched job ring for $jobId")
    } catch (t: Throwable) {
      Log.w(TAG, "Auto-launch blocked for $jobId; the FSI notification is the fallback", t)
    }
  }

  private fun showFullScreenJobAlert(remoteMessage: RemoteMessage, jobId: String, data: Map<String, String>) {
    ensureJobAlertChannel()

    // Job-alert pushes carry a DISPLAY payload (top-level title/body) alongside
    // the job data: FCM renders the tray alert itself when the app is closed
    // (process dead), and delivers every message to onMessageReceived whenever
    // the app is running, where this service raises the full-screen alert.
    // `remoteMessage.notification` may still be null on unusual paths — read
    // from data first, and never hard-fail on either source.
    val title = data["title"]?.takeIf { it.isNotBlank() }
      ?: remoteMessage.notification?.title?.takeIf { it.isNotBlank() }
      ?: DEFAULT_TITLE
    val body = data["body"]?.takeIf { it.isNotBlank() }
      ?: remoteMessage.notification?.body?.takeIf { it.isNotBlank() }
      ?: DEFAULT_BODY

    val contentIntent =
      PendingIntent.getActivity(
        this,
        jobId.hashCode(),
        buildOpenIntent(jobId),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val notification =
      NotificationCompat.Builder(this, JOB_ALERT_CHANNEL)
        .setSmallIcon(resolveSmallIcon())
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setShowWhen(true)
        .setContentIntent(contentIntent)
        // true = show this over the current app/screen as soon as it fires.
        .setFullScreenIntent(contentIntent, true)
        .build()

    // One tray entry per job: repeats from the server replace, never stack.
    NotificationManagerCompat.from(this).notify(jobId.hashCode(), notification)
    Log.i(TAG, "Posted full-screen alert for job $jobId (title=$title)")
  }

  /**
   * Minimal, dependency-free fallback used if the full-screen path ever throws:
   * still posts a loud tray notification so the alert is never lost silently.
   */
  private fun postFallbackAlert(remoteMessage: RemoteMessage, jobId: String) {
    ensureJobAlertChannel()
    val title = remoteMessage.data["title"] ?: DEFAULT_TITLE
    val body = remoteMessage.data["body"] ?: DEFAULT_BODY
    val notification =
      NotificationCompat.Builder(this, JOB_ALERT_CHANNEL)
        .setSmallIcon(resolveSmallIcon())
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setAutoCancel(true)
        .build()
    NotificationManagerCompat.from(this).notify(jobId.hashCode(), notification)
    Log.i(TAG, "Posted fallback alert for job $jobId")
  }

  private fun ensureJobAlertChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(JOB_ALERT_CHANNEL) != null) return

    val channel =
      NotificationChannel(JOB_ALERT_CHANNEL, "Job alerts", NotificationManager.IMPORTANCE_MAX).apply {
        description = "New job requests from nearby customers"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 250, 250, 250)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          setBypassDnd(true)
        }
        val soundRawId = getRawResourceId("job_alert")
        if (soundRawId != 0) {
          val soundUri = Uri.parse("android.resource://$packageName/$soundRawId")
          setSound(
            soundUri,
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
        }
      }
    manager.createNotificationChannel(channel)
  }

  private fun getRawResourceId(name: String): Int =
    runCatching { resources.getIdentifier(name, "raw", packageName) }.getOrDefault(0)

  private fun resolveSmallIcon(): Int {
    val brandIcon = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (brandIcon != 0) brandIcon else android.R.drawable.ic_dialog_info
  }
}