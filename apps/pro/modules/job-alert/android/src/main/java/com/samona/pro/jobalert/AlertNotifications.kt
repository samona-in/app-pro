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

  /** Dedicated channel for "customer cancelled your job" heads-ups. */
  const val CANCELLATION_CHANNEL_ID = "job_cancelled"
  const val CANCELLATION_CHANNEL_NAME = "Job cancelled"

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

  /**
   * The cancellation channel: a MAX heads-up that can wake a screen-off device
   * but deliberately carries no sound and no channel vibration — the repeating
   * [JobAlertCancellation] ring owns the audio cue so the ~9.6s cap is never
   * stretched by a second vibrator.
   */
  fun ensureCancellationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CANCELLATION_CHANNEL_ID) != null) return

    val channel =
      NotificationChannel(CANCELLATION_CHANNEL_ID, CANCELLATION_CHANNEL_NAME, NotificationManager.IMPORTANCE_MAX).apply {
        description = "A customer cancelled a job you were committed to"
        enableVibration(false)
        setSound(null, null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) setBypassDnd(true)
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
   * MAX importance heads-up.
   *
   * The content intent is count-aware: while several offers are pending it
   * opens the combined `incoming-jobs` route (the single place that lists every
   * offer), otherwise the `job-alert/[id]` route for the single request.
   */
  fun postAlert(context: Context, alert: IncomingJobAlert, fullScreen: Boolean) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      Log.w(JOB_ALERT_TAG, "Notifications disabled — skipping tray for job ${alert.jobId}")
      return
    }
    ensureChannel(context)

    val title = alert.title.ifBlank { DEFAULT_TITLE }
    val body = buildBody(alert)

    val contentIntent = pendingContentIntent(context, alert)
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
   * Posts the "job cancelled" heads-up for one assignment cancellation.
   *
   * The channel is MAX (wake a screen-off device) but silent — the long
   * repeating ring is [JobAlertCancellation]'s. Tapping opens the app on its
   * current task (CLEAR_TOP) where the JS modal presents the same cancellation
   * and gives the pro their single acknowledgement.
   */
  fun postAssignmentCancellation(context: Context, jobId: String) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      Log.w(JOB_ALERT_TAG, "Notifications disabled — skipping cancellation tray for job $jobId")
      return
    }
    ensureCancellationChannel(context)
    val builder =
      NotificationCompat.Builder(context, CANCELLATION_CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle("Job cancelled")
        .setContentText("The customer cancelled this booking.")
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setShowWhen(true)
        .setContentIntent(openMainActivityPendingIntent(context))
    NotificationManagerCompat.from(context).notify(jobId.hashCode(), builder.build())
    Log.i(JOB_ALERT_TAG, "Posted cancellation tray for job $jobId")
  }

  /** Intent that brings the already-running MainActivity back to the front. */
  private fun openMainActivityPendingIntent(context: Context): PendingIntent {
    val intent =
      Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
        setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    return PendingIntent.getActivity(
      context,
      "job-cancelled".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
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
    val category = alert.categoryLabel()
    val headline =
      when {
        category != null && alert.serviceName.isNotBlank() -> "${alert.serviceName} · $category"
        category != null -> category
        else -> alert.serviceName
      }
    val meta = alert.metaLine()
    val lines =
      buildList {
        if (headline.isNotBlank()) add(headline)
        if (alert.address.isNotBlank()) add(alert.address)
        if (meta.isNotBlank()) add(meta)
      }
    return lines.joinToString("\n").ifBlank { DEFAULT_BODY }
  }

  /**
   * Chooses where tapping a job alert lands: the combined `incoming-jobs` list
   * when the pro has several offers pending at once, else the single
   * `job-alert/[id]` route for this one request.
   */
  private fun pendingContentIntent(context: Context, alert: IncomingJobAlert): PendingIntent {
    val pendingCount = AlertStore(context).loadJobs().size
    return if (pendingCount > 1) {
      openIncomingJobsPendingIntent(context)
    } else {
      openJobPendingIntent(context, alert.jobId)
    }
  }

  /** Intent that opens the combined `incoming-jobs` route on MainActivity. */
  private fun openIncomingJobsPendingIntent(context: Context): PendingIntent {
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse(JOB_OFFERS_DEEP_LINK))
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
    return PendingIntent.getActivity(
      context,
      "incoming-jobs".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
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