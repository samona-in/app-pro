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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Central place for native job-alert tray presentation.
 *
 * One channel — `incoming_jobs`, IMPORTANCE_MAX, the looping `job_alert`
 * sound, vibration and DND bypass — matches what the JS `ensureChannel()` and
 * the server (`channelId` on every FCM push) use, so a display notification
 * delivered while the process is dead raises the same full, audible alert as
 * the native ring. The channel is also created here because a push can arrive
 * before the JS layer ever opens.
 */
object AlertNotifications {
  const val CHANNEL_ID = "incoming_jobs"
  const val CHANNEL_NAME = "Job alerts"

  private const val DEFAULT_TITLE = "New job request"
  private const val DEFAULT_BODY = "A customer nearby needs your services."

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val soundRawId = context.resources.getIdentifier("job_alert", "raw", context.packageName)
    val channel =
      NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_MAX).apply {
        description = "New job requests from nearby customers"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 250, 250, 250)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) setBypassDnd(true)
        if (soundRawId != 0) {
          setSound(
            Uri.parse("android.resource://${context.packageName}/$soundRawId"),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
        }
      }
    manager.createNotificationChannel(channel)
  }

  fun cancel(context: Context, jobId: String) {
    runCatching { NotificationManagerCompat.from(context).cancel(jobId.hashCode()) }
  }

  /**
   * Posts the job alert tray entry for [alert]. One entry per job (id =
   * jobId.hashCode(), matching the server's `tag`/`collapseKey`). With
   * [fullScreen] the notification tries to cover the screen (Android ≤13
   * automatically; the per-app role decides on 14+); otherwise it is still a
   * MAX importance heads-up. The content intent opens the `job-alert/[id]`
   * route, which raises the in-app ring.
   */
  fun postAlert(context: Context, alert: IncomingJobAlert, fullScreen: Boolean) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      Log.w(JOB_ALERT_TAG, "Notifications disabled — skipping tray for job ${alert.jobId}")
      return
    }
    ensureChannel(context)

    val title = alert.title.ifBlank { DEFAULT_TITLE }
    val body = buildBody(alert)

    val contentIntent = openJobPendingIntent(context, alert.jobId)
    val builder =
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setShowWhen(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(contentIntent)
        .addAction(0, "Decline", actionPendingIntent(context, alert, "decline"))
        .addAction(0, "Accept", actionPendingIntent(context, alert, "accept"))
    if (fullScreen) builder.setFullScreenIntent(contentIntent, true)

    NotificationManagerCompat.from(context).notify(alert.jobId.hashCode(), builder.build())
    Log.i(JOB_ALERT_TAG, "Posted alert job=${alert.jobId} fullScreen=$fullScreen")
  }

  /**
   * Broadcast to the [JobAlertActionReceiver] so a tray action behaves exactly
   * like an overlay tap: it redeems the offer token natively when present and
   * falls back to recording the choice + opening the app otherwise.
   */
  private fun actionPendingIntent(context: Context, alert: IncomingJobAlert, action: String): PendingIntent {
    val intent =
      Intent(context, JobAlertActionReceiver::class.java)
        .setAction(JobAlertActionReceiver.ACTION_ALERT_ACTION)
        .putExtra(JobAlertActionReceiver.EXTRA_JOB_ID, alert.jobId)
        .putExtra(JobAlertActionReceiver.EXTRA_ACTION, action)
        .apply {
          if (alert.hasOfferToken) {
            putExtra(JobAlertActionReceiver.EXTRA_OFFER_TOKEN, alert.jobOfferToken)
          }
        }
    return PendingIntent.getBroadcast(
      context,
      "tray-$action-${alert.jobId.hashCode()}".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildBody(alert: IncomingJobAlert): String {
    val meta = alert.metaLine()
    return when {
      meta.isNotBlank() && alert.address.isNotBlank() -> "${alert.address}\n$meta"
      meta.isNotBlank() -> meta
      alert.address.isNotBlank() -> alert.address
      else -> DEFAULT_BODY
    }
  }

  /** Intent that opens the `job-alert/[id]` route on MainActivity. */
  private fun openJobPendingIntent(context: Context, jobId: String): PendingIntent {
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse("$JOB_ALERT_DEEP_LINK_PREFIX$jobId"))
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
    return PendingIntent.getActivity(
      context,
      jobId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun smallIcon(context: Context): Int {
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (icon != 0) icon else android.R.drawable.ic_dialog_info
  }
}