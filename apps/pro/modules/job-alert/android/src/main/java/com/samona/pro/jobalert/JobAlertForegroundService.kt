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
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
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
        .setContentTitle("SAMONA Pro is online")
        .setContentText("Receiving job alerts in the background — tap to open.")
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
  }

  private fun ensureOnlineChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(ONLINE_CHANNEL) != null) return

    val channel =
      NotificationChannel(ONLINE_CHANNEL, "Online job alerts", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Keeps SAMONA Pro running in the background to alert you to nearby jobs while online"
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
  }
}