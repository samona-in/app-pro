package com.samona.pro.jobalert

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The Rapido-style SYSTEM_ALERT_WINDOW banner for a NEW_JOB request.
 *
 * Shown only when the pro has granted "display over other apps" (so it draws
 * over any app, or over the lock screen via SHOW_WHEN_LOCKED). Accept/Decline
 * route through the [JobAlertActionReceiver], which records the choice, drops
 * the native alert, and hands the job to the app so the authorized API call
 * happens in JS — never native. The overlay auto-dismisses after
 * [MAX_DISPLAY_MS] to match the [JobAlertSound] ring; the alert itself stays
 * in the tray and [AlertStore] until resolved or expired.
 */
object JobAlertOverlay {
  private const val MAX_DISPLAY_MS = 10_000L

  private val lock = Any()

  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var overlayJobId: String? = null
  private val handler = Handler(Looper.getMainLooper())
  private var dismissRunnable: Runnable? = null

  /**
   * Shows the banner for [alert]. No-op without overlay permission. A second
   * alert replaces any current banner (one ring at a time).
   */
  fun show(context: Context, alert: IncomingJobAlert) {
    synchronized(lock) {
      if (overlayView != null) hideAllInternal()
      if (!Settings.canDrawOverlays(context)) return

      val appContext = context.applicationContext
      val wm = appContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
      val view = buildView(appContext, alert)

      val params =
        WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
          PixelFormat.TRANSLUCENT,
        ).apply {
          gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        }

      val added =
        runCatching { wm.addView(view, params) }.onFailure { t ->
          Log.w(JOB_ALERT_TAG, "Overlay add failed for job ${alert.jobId}; tray remains", t)
        }.isSuccess
      if (!added) return

      windowManager = wm
      overlayView = view
      overlayJobId = alert.jobId
      Log.i(JOB_ALERT_TAG, "Showing overlay for job ${alert.jobId}")

      val runnable = Runnable {
        Log.d(JOB_ALERT_TAG, "Overlay auto-dismissed job ${alert.jobId}")
        hideAll()
      }
      dismissRunnable = runnable
      handler.postDelayed(runnable, MAX_DISPLAY_MS)
    }
  }

  /** Dismisses the banner only when it is showing [jobId]. */
  fun hide(jobId: String) {
    synchronized(lock) {
      if (overlayJobId == jobId) hideAllInternal()
    }
  }

  /** Dismisses whatever banner is showing. */
  fun hideAll() {
    synchronized(lock) { hideAllInternal() }
  }

  private fun hideAllInternal() {
    dismissRunnable?.let { handler.removeCallbacks(it) }
    dismissRunnable = null
    val view = overlayView ?: return
    overlayView = null
    overlayJobId = null
    runCatching { windowManager?.removeView(view) }
    windowManager = null
  }

  private fun buildView(context: Context, alert: IncomingJobAlert): View {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int): Int = (value * density).toInt()

    val card =
      LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(16), dp(20), dp(16))
        background = gradient(dp(16).toFloat(), Color.rgb(30, 32, 36))
        elevation = 12f
      }

    val title =
      TextView(context).apply {
        text = "Request received"
        setTextColor(Color.rgb(163, 173, 190))
        textSize = 13f
      }
    card.addView(title)

    val service =
      TextView(context).apply {
        text = alert.serviceName.ifBlank { "New job" }
        setTextColor(Color.WHITE)
        textSize = 22f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        setPadding(0, dp(4), 0, 0)
      }
    card.addView(service)

    val address =
      TextView(context).apply {
        text = alert.address.ifBlank { "Customer location shared after acceptance" }
        setTextColor(Color.rgb(226, 228, 232))
        textSize = 15f
        setPadding(0, dp(6), 0, 0)
      }
    card.addView(address)

    val meta = alert.metaLine()
    if (meta.isNotBlank()) {
      card.addView(
        TextView(context).apply {
          text = meta
          setTextColor(Color.rgb(173, 220, 190))
          textSize = 14f
          setPadding(0, dp(4), 0, 0)
        },
      )
    }

    val actions =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(16), 0, 0)
      }
    card.addView(actions)

    val accept =
      actionButton(context, alert, "accept", "Accept", Color.rgb(34, 197, 94))
    val decline =
      actionButton(context, alert, "decline", "Decline", Color.rgb(71, 74, 82))

    actions.addView(
      decline,
      LinearLayout.LayoutParams(0, dp(52), 1f).apply { marginEnd = dp(8) },
    )
    actions.addView(
      accept,
      LinearLayout.LayoutParams(0, dp(52), 1f).apply { marginStart = dp(8) },
    )

    return card
  }

  private fun actionButton(
    context: Context,
    alert: IncomingJobAlert,
    action: String,
    label: String,
    color: Int,
  ): Button {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int): Int = (value * density).toInt()

    return Button(context).apply {
      text = label
      setTextColor(Color.WHITE)
      textSize = 16f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      background = gradient(dp(12).toFloat(), color)
      contentDescription = "${alert.serviceName.ifBlank { "job" }} — $label"
      // The click does not call any API: it records the choice and opens the
      // app, where the in-app ring performs the authorized call.
      setOnClickListener {
        val pending = pendingActionIntent(context, alert.jobId, action)
        runCatching { pending.send() }
      }
    }
  }

  private fun pendingActionIntent(context: Context, jobId: String, action: String): PendingIntent {
    val intent =
      Intent(context, JobAlertActionReceiver::class.java)
        .setAction(JobAlertActionReceiver.ACTION_ALERT_ACTION)
        .putExtra(JobAlertActionReceiver.EXTRA_JOB_ID, jobId)
        .putExtra(JobAlertActionReceiver.EXTRA_ACTION, action)
    return PendingIntent.getBroadcast(
      context,
      "job-alert-$action-${jobId.hashCode()}".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun gradient(cornerRadius: Float, color: Int): GradientDrawable =
    GradientDrawable().apply {
      this.cornerRadius = cornerRadius
      setColor(color)
    }
}