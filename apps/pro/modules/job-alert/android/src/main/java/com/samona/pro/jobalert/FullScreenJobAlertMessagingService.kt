package com.samona.pro.jobalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
 *  - Every other message is handed to the superclass, so Expo's foreground and
 *    background handling, and the FCM token flow, keep working as before.
 *
 * A separate NotificationManager channel ("job-alerts") backend, matching the
 * one `ensureChannel()` creates from JS, is used so the alert is loud, audible
 * and DND-bypassing even if a notification arrives before the app ever opened.
 */
class FullScreenJobAlertMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val type = data["type"]
    val jobId = data["jobId"]

    if (type == NEW_JOB_TYPE && !jobId.isNullOrBlank()) {
      showFullScreenJobAlert(remoteMessage, jobId, data)
      // Deliberately do not call super: posting the notification twice (ours +
      // Expo's) would raise two alerts for the same job.
      return
    }

    super.onMessageReceived(remoteMessage)
  }

  private fun showFullScreenJobAlert(remoteMessage: RemoteMessage, jobId: String, data: Map<String, String>) {
    ensureJobAlertChannel()

    // Job-alert pushes are DATA-ONLY (the server moves title/body into the data
    // bundle) so FCM always wakes this service even when the app is closed.
    // `remoteMessage.notification` is therefore null — read from data first,
    // and never hard-fail on either source.
    val title = data["title"]?.takeIf { it.isNotBlank() }
      ?: remoteMessage.notification?.title?.takeIf { it.isNotBlank() }
      ?: DEFAULT_TITLE
    val body = data["body"]?.takeIf { it.isNotBlank() }
      ?: remoteMessage.notification?.body?.takeIf { it.isNotBlank() }
      ?: DEFAULT_BODY

    // MainActivity is singleTask, so a fired intent either launches it or is
    // delivered as onNewIntent; expo-router then resolves `job-alert/[id]`.
    val openIntent =
      Intent(Intent.ACTION_VIEW, Uri.parse("$JOB_ALERT_DEEP_LINK_PREFIX$jobId")).apply {
        component = ComponentName(packageName, "$packageName.MainActivity")
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
      }

    val contentIntent =
      PendingIntent.getActivity(
        this,
        jobId.hashCode(),
        openIntent,
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