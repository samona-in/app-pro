package com.samona.pro.jobalert

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * The looping ring that accompanies pending job offers.
 *
 * Plays the `job_alert` raw asset on a loop (falling back to the system alarm
 * sound when the asset is missing from a stale build) backed by a partial wake
 * lock so the ring is not cut short when the device sleeps. The single global
 * controller is [syncPending]: it is driven by the number of pending offers,
 * not by the overlay UI, so navigating to the `incoming-jobs` screen (where the
 * floating alert is suppressed) never silences the ring.
 *
 * Exactly one alarm at a time — a second NEW_JOB simply keeps the current
 * ring. [syncPending] starts only on a `0 → N` transition (never restarts an
 * existing ring), keeps it playing while any offer is pending, and stops only
 * when the count reaches zero or an explicit business stop ([stop], e.g. going
 * offline) fires. [stop] is idempotent.
 */
object JobAlertSound {
  private val lock = Any()

  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null

  /**
   * Keeps the ring in step with the pending-offer count. Pending offers exist →
   * ring on (already playing → no-op, so a route change or extra offer never
   * restarts it); no pending offers → ring off.
   */
  fun syncPending(context: Context, pendingCount: Int) {
    synchronized(lock) {
      if (pendingCount > 0) {
        if (mediaPlayer?.isPlaying == true) return
        startLocked(context)
      } else {
        stopLocked()
      }
    }
  }

  fun stop() {
    synchronized(lock) { stopLocked() }
  }

  private fun startLocked(context: Context) {
    val player =
      runCatching {
        val rawId = context.resources.getIdentifier("job_alert", "raw", context.packageName)
        if (rawId != 0) {
          MediaPlayer.create(context, rawId)
        } else {
          MediaPlayer().apply {
            setDataSource(context, Settings.System.DEFAULT_ALARM_ALERT_URI)
            prepare()
          }
        }
      }.getOrNull() ?: return

    runCatching {
      player.isLooping = true
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      player.start()
      mediaPlayer = player

      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock =
        pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$JOB_ALERT_TAG:Ring").apply {
          setReferenceCounted(false)
          acquire()
        }
      Log.i(JOB_ALERT_TAG, "Started ringing (loops while offers pending)")
    }.onFailure { t ->
      Log.w(JOB_ALERT_TAG, "Failed to start ring", t)
      runCatching { player.release() }
    }
  }

  private fun stopLocked() {
    runCatching { mediaPlayer?.stop() }
    runCatching { mediaPlayer?.release() }
    mediaPlayer = null
    runCatching { wakeLock?.release() }
    wakeLock = null
  }
}
