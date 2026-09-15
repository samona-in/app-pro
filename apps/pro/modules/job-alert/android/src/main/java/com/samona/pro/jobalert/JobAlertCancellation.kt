package com.samona.pro.jobalert

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/** Number of pulses in the cancellation vibration; 12 × (600ms + 200ms) ≈ 9.6s. */
private const val PULSES = 12

/**
 * The native presentation of a "customer cancelled your accepted job" alert.
 *
 * One venue wins per job. The first surface to notice — the socket while the
 * app is alive, the FCM push while it is backgrounded or killed — records the
 * cancellation in [AlertStore] and calls [present]; the other then no-ops
 * because the job is already stored, so there is exactly one vibration and one
 * tray entry. [clear] stops the now-misleading vibration and drops the tray
 * entry the moment the pro acknowledges.
 *
 * Vibration is deliberately finite: 12 short pulses over ~9.6s, never one long
 * uninterrupted buzz. The 10s cap is a cap on the *vibration*, not on the
 * alert — the JS modal stays up until the pro taps okay.
 */
object JobAlertCancellation {
  private val VIBRATION_PATTERN: LongArray =
    longArrayOf(0) + LongArray(PULSES * 2) { index -> if (index % 2 == 0) 600L else 200L }

  /** Starts the repeating cancellation vibration for [jobId]. */
  fun present(context: Context, jobId: String) {
    val vibrator = vibrator(context)
    if (vibrator != null) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(VIBRATION_PATTERN, -1)
      }
    }
    Log.i(JOB_ALERT_TAG, "Pulsing cancellation vibration for job $jobId")
  }

  /** Stops any in-flight cancellation vibration and drops the tray entry. */
  fun clear(context: Context, jobId: String) {
    val vibrator = vibrator(context)
    @Suppress("DEPRECATION")
    vibrator?.cancel()
    AlertNotifications.cancel(context, jobId)
    Log.i(JOB_ALERT_TAG, "Cleared cancellation alert for job $jobId")
  }

  private fun vibrator(context: Context): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
      manager?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }
}