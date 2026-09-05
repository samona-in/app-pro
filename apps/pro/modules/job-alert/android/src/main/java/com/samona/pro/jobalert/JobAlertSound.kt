package com.samona.pro.jobalert

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * The looping alarm that accompanies the [JobAlertOverlay].
 *
 * Plays the `job_alert` raw asset on a loop (falling back to the system alarm
 * sound when the asset is missing from a stale build), capped at [MAX_RING_MS]
 * and backed by a partial wake lock so the ring is not cut short when the
 * device sleeps. Exactly one ring at a time — a second NEW_JOB simply keeps the
 * current one. [stop] is idempotent and is also called when the alert is
 * dismissed from any path (overlay tap, terminal push, going offline).
 */
object JobAlertSound {
  private const val MAX_RING_MS = 10_000L

  private val lock = Any()

  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private var stopRunnable: Runnable? = null

  fun start(context: Context) {
    synchronized(lock) {
      if (mediaPlayer?.isPlaying == true) return

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
            acquire(MAX_RING_MS)
          }

        val runnable = Runnable {
          Log.i(JOB_ALERT_TAG, "Ring capped at $MAX_RING_MS ms")
          stop()
        }
        stopRunnable = runnable
        handler.postDelayed(runnable, MAX_RING_MS)
        Log.i(JOB_ALERT_TAG, "Started ringing (10s cap)")
      }.onFailure { t ->
        Log.w(JOB_ALERT_TAG, "Failed to start ring", t)
        runCatching { player.release() }
      }
    }
  }

  fun stop() {
    synchronized(lock) {
      stopRunnable?.let { handler.removeCallbacks(it) }
      stopRunnable = null
      runCatching { mediaPlayer?.stop() }
      runCatching { mediaPlayer?.release() }
      mediaPlayer = null
      runCatching { wakeLock?.release() }
      wakeLock = null
    }
  }
}