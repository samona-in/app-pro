package com.samona.pro.jobalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Restarts the online foreground service after a reboot.
 *
 * A pro who stays online exchanges a "go online" tap for "the phone rebooted
 * and I forgot to go back online". This receiver checks the persisted online
 * flag ([AlertStore.isOnline], written by [JobAlertBackgroundModule]'s
 * start/stop as the online-status mirror runs) and, when left online,
 * restarts [JobAlertForegroundService] so NEW_JOB pushes keep flowing.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

    val online = AlertStore(context).isOnline()
    Log.i(JOB_ALERT_TAG, "Boot completed; online flag=$online")
    if (!online) return

    val ok =
      runCatching {
        ContextCompat.startForegroundService(
          context,
          Intent(context, JobAlertForegroundService::class.java),
        )
      }.isSuccess
    Log.i(JOB_ALERT_TAG, "Foreground service restart after boot: $ok")
  }
}