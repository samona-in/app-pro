package com.samona.pro.jobalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

private const val ONLINE_CHANNEL = "job-alert-online"
private const val ONLINE_NOTIFICATION_ID = 1010
private const val TAG = "SamonaJobAlertFg"

/**
 * Keeps SAMONA Pro alive in the background while the pro is online.
 *
 * A swipe-away (or memory reclaim) leaves the JavaScript runtime dead, which
 * means [FullScreenJobAlertMessagingService.onMessageReceived] can no longer
 * raise the full-screen ring on a NEW_JOB push. Running a foreground service
 * while online keeps the process alive, so the messaging service keeps
 * receiving pushes and the alert still covers the whole screen.
 *
 * Android requires every foreground service to display a persistent
 * notification; that notification doubles as the "you're online and can
 * receive jobs" indicator (low importance, so it never buzzes or full-screens).
 *
 * The service is `specialUse` typed (see the manifest property): this is the
 * allowed type for locating and connecting the pro to nearby jobs.
 */
class JobAlertForegroundService : Service() {
  override fun onCreate() {
    super.onCreate()
    // Keep the process-wide foreground flag accurate while this service keeps
    // the app alive, so a NEW_JOB push knows when to auto-bring the app forward.
    AppForeground.register(application)
    ensureOnlineChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      FloatingBubble.hideAll()
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    enterForeground()

    // START_STICKY: if the OS reclaims the process under memory pressure, it
    // restarts the service (and the process with it) so FCM pushes keep
    // arriving while the pro is still online. The restart comes back with a
    // null intent, which just re-enters foreground.
    return START_STICKY
  }

  override fun onDestroy() {
    FloatingBubble.hideAll()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    // A config change (e.g. a split-screen resize) can move the screen edges
    // under the bubble; rebuild it clamped back on-screen. Harmless when no
    // bubble is up — reconcile simply shows nothing.
    FloatingBubble.hideAll()
    FloatingBubble.reconcile(this)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun enterForeground() {
    ensureOnlineChannel()

    val openIntent =
      Intent(Intent.ACTION_MAIN).apply {
        component = ComponentName(packageName, "$packageName.MainActivity")
        addCategory(Intent.CATEGORY_LAUNCHER)
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    val contentIntent =
      PendingIntent.getActivity(
        this,
        0,
        openIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val notification =
      NotificationCompat.Builder(this, ONLINE_CHANNEL)
        .setSmallIcon(resolveSmallIcon())
        .setContentTitle(JobAlertLocale.string(this, R.string.online_notification_title))
        .setContentText(JobAlertLocale.string(this, R.string.online_notification_body))
        .setContentIntent(contentIntent)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        ONLINE_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(ONLINE_NOTIFICATION_ID, notification)
    }

    Log.i(TAG, "Started online job-alert foreground service")
    // The online pro gets the floating Samona icon. Reconcile on every (re)start
    // so a service restart or a permission (re)grant can never leave it stale:
    // the gate re-checks the persisted online flag and the overlay permission.
    FloatingBubble.reconcile(this)
  }

  private fun ensureOnlineChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(ONLINE_CHANNEL) != null) return

    val channel =
      NotificationChannel(
        ONLINE_CHANNEL,
        JobAlertLocale.string(this, R.string.online_alerts_channel_name),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = JobAlertLocale.string(this, R.string.online_alerts_channel_desc)
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  private fun resolveSmallIcon(): Int {
    val brandIcon = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (brandIcon != 0) brandIcon else android.R.drawable.ic_menu_compass
  }

  companion object {
    const val ACTION_START = "com.samona.pro.jobalert.FOREGROUND_START"
    const val ACTION_STOP = "com.samona.pro.jobalert.FOREGROUND_STOP"

    /**
     * Renames the online channel when the app language changes mid-session so
     * the always-visible system notification matches the pro's language. The
     * re-created channel keeps any user overrides for this channel.
     */
    fun updateOnlineChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.getNotificationChannel(ONLINE_CHANNEL)?.let { channel ->
        channel.name = JobAlertLocale.string(context, R.string.online_alerts_channel_name)
        channel.description = JobAlertLocale.string(context, R.string.online_alerts_channel_desc)
        manager.createNotificationChannel(channel)
      }
    }
  }
}