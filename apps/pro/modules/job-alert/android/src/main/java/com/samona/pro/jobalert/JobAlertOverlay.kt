package com.samona.pro.jobalert

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
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
 * The Rapido-style SYSTEM_ALERT_WINDOW banner for NEW_JOB requests.
 *
 * Shown only when the pro has granted "display over other apps" (so it draws
 * over any app, or over the lock screen via SHOW_WHEN_LOCKED). It is the sole
 * surface for this tier — no tray notification accompanies it — so the window
 * turns a screen-off device on itself (FLAG_TURN_SCREEN_ON). Accept/Decline
 * route through the [JobAlertActionReceiver]: with an offer token the receiver
 * redeems the job natively over the API; without one it records the choice and
 * hands the job to the app. The overlay auto-dismisses after [durationMs] —
 * the same server-minted offer window the ring and the "Expires in" countdown
 * use — and the request remains in [AlertStore] until resolved or expired.
 *
 * Entry point to the combined list: tapping the card body (or the "View all N
 * job offers" row rendered below the card when several are pending) opens the
 * in-app `incoming-jobs` route, which lists every persisted offer. A NEW_JOB
 * for a *different* job never replaces the banner for the one already showing —
 * the active banner stays as the entry point, its pending count refreshes, and
 * the ring re-sounds so the new offer is still heard. Every offer is kept in
 * [AlertStore] until resolved, expired or accepted.
 */
object JobAlertOverlay {
  private val lock = Any()

  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var overlayJobId: String? = null
  private val handler = Handler(Looper.getMainLooper())
  private var dismissRunnable: Runnable? = null
  private var tickRunnable: Runnable? = null
  private var countdownTextView: TextView? = null
  private var acceptButton: Button? = null
  private var ringButton: RingButtonView? = null
  private var viewAllTextView: TextView? = null

  /**
   * Shows the banner for [alert]. A second alert for a *different* job keeps
   * the current banner as the entry point and refreshes its pending count —
   * it never replaces a stored offer (one banner at a time, all offers kept).
   *
   * Must run on the main thread: `WindowManager.addView` requires a Looper and
   * throws off-thread. Push delivery ([JobAlertMessagingService]) runs on a
   * Firebase worker thread, so every entry point first hops to the main handler.
   */
  fun show(context: Context, alert: IncomingJobAlert, durationMs: Long) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      val appContext = context.applicationContext
      handler.post { show(appContext, alert, durationMs) }
      return
    }
    val appContext = context.applicationContext
    if (!Settings.canDrawOverlays(appContext)) return
    synchronized(lock) {
      val store = AlertStore(appContext)
      val pendingCount = store.loadJobs().size
      if (overlayJobId != null && overlayJobId != alert.jobId) {
        // A different job arrived while a banner is up. Keep the current banner
        // (never replace), refresh its "N job offers" entry line, and re-ring so
        // the new offer is not missed. All offers remain in AlertStore.
        val current = store.loadJobs().firstOrNull { it.jobId == overlayJobId } ?: alert
        Log.i(JOB_ALERT_TAG, "Another job ${alert.jobId} arrived while ${current.jobId} banner up; keeping banner, count=$pendingCount")
        showLocked(appContext, current, pendingCount, durationMs)
        JobAlertSound.start(appContext, alert.presentationDurationMs())
        return
      }
      showLocked(appContext, alert, pendingCount, durationMs)
    }
  }

  /**
   * Renders (or re-renders) the single overlay banner for [alert]. Handling a
   * re-page of the same job is why this rebuilds rather than bailing when the
   * banner is already up: the pending-count entry line must stay current.
   */
  private fun showLocked(
    context: Context,
    alert: IncomingJobAlert,
    pendingCount: Int,
    durationMs: Long,
  ) {
    hideAllInternal()
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    val view = buildView(context, alert, pendingCount)

    val params =
      WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      }

    val added =
      runCatching { wm.addView(view, params) }.onFailure { t ->
        Log.w(JOB_ALERT_TAG, "Overlay add failed for job ${alert.jobId}", t)
      }.isSuccess
    if (!added) return

    windowManager = wm
    overlayView = view
    overlayJobId = alert.jobId
    Log.i(JOB_ALERT_TAG, "Showing overlay for job ${alert.jobId} (${pendingCount} pending)")

    val runnable = Runnable {
      Log.d(JOB_ALERT_TAG, "Overlay auto-dismissed job ${alert.jobId}")
      hideAll()
    }
    dismissRunnable = runnable
    handler.postDelayed(runnable, durationMs)
  }

  /** Dismisses the banner only when it is showing [jobId]. */
  fun hide(jobId: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      handler.post { hide(jobId) }
      return
    }
    synchronized(lock) {
      if (overlayJobId == jobId) hideAllInternal()
    }
  }

  /** Dismisses whatever banner is showing. */
  fun hideAll() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      handler.post { hideAll() }
      return
    }
    synchronized(lock) { hideAllInternal() }
  }

  private fun hideAllInternal() {
    dismissRunnable?.let { handler.removeCallbacks(it) }
    dismissRunnable = null
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
    countdownTextView = null
    acceptButton = null
    ringButton = null
    viewAllTextView = null
    val view = overlayView ?: return
    overlayView = null
    overlayJobId = null
    runCatching { windowManager?.removeView(view) }
    windowManager = null
  }

  private fun buildView(context: Context, alert: IncomingJobAlert, pendingCount: Int): View {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int): Int = (value * density).toInt()

    // Root column holds the alert card with the "View all N job offers" entry
    // row rendered below it, outside the card, so it reads as a separate
    // navigation action rather than part of the alert.
    val root =
      LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
      }

    val card =
      LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(16), dp(20), dp(16))
        background =
          gradient(dp(16).toFloat(), JobAlertTheme.SURFACE).apply {
            // A hairline SAMONA-slate border keeps the card legible against the
            // light background without needing a drop shadow on the lock screen.
            setStroke(dp(1), JobAlertTheme.BORDER_STRONG)
          }
        elevation = JobAlertTheme.CARD_ELEVATION
        // The whole card is the entry point to the combined offers list; the
        // Accept/Decline buttons are children and keep their own taps.
        setOnClickListener { openIncomingJobs(context) }
      }

    // Row 1: service name (left) with the guaranteed amount right beside it.
    val serviceRow =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
      }
    val service =
      TextView(context).apply {
        text = alert.serviceName.ifBlank { "New job" }
        setTextColor(JobAlertTheme.TEXT_PRIMARY)
        textSize = 22f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        layoutParams =
          LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      }
    serviceRow.addView(service)
    alert.amountLabel()?.let { amount ->
      serviceRow.addView(
        TextView(context).apply {
          text = amount
          setTextColor(JobAlertTheme.SUCCESS)
          textSize = 20f
          typeface = android.graphics.Typeface.DEFAULT_BOLD
          setPadding(dp(12), 0, 0, 0)
        },
      )
    }
    card.addView(serviceRow)

    // The category within the service (e.g. "AC installation"), so the pro sees
    // exactly what the customer asked for without a second lookup.
    alert.categoryLabel()?.let { category ->
      card.addView(
        TextView(context).apply {
          text = category
          setTextColor(JobAlertTheme.TEXT_SECONDARY)
          textSize = 13f
          setPadding(0, dp(2), 0, 0)
        },
      )
    }

    // Distance sits directly above the location.
    alert.distanceLabel()?.let { distance ->
      card.addView(
        TextView(context).apply {
          text = distance
          setTextColor(JobAlertTheme.TEXT_MUTED)
          textSize = 14f
          setPadding(0, dp(6), 0, 0)
        },
      )
    }

    val address =
        TextView(context).apply {
          text = alert.address.ifBlank { "Customer location shared after acceptance" }
          setTextColor(JobAlertTheme.TEXT_SECONDARY)
          textSize = 15f
          setPadding(0, dp(2), 0, 0)
        }
    card.addView(address)

    val deadline = alert.offerExpiresAtMillis() ?: alert.jobExpiryMillis()
    var countdown: TextView? = null
    if (deadline != null) {
      countdown =
        TextView(context).apply { textSize = 13f; setPadding(0, dp(6), 0, 0) }
      card.addView(countdown)
    }

    // When several offers are pending, surface an explicit entry line into the
    // combined incoming-jobs list so the pro never loses the other requests.
    // It sits below the card (outside it), aligned with the card content, so it
    // reads as a separate navigation action rather than part of the alert.
    var viewAll: TextView? = null
    if (pendingCount > 1) {
      viewAll =
        TextView(context).apply {
          text = "View all $pendingCount job offers →"
          setTextColor(JobAlertTheme.BRAND)
          textSize = 14f
          typeface = android.graphics.Typeface.DEFAULT_BOLD
          setOnClickListener { openIncomingJobs(context) }
        }
      viewAllTextView = viewAll
    }

    val actions =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(16), 0, 0)
      }
    card.addView(actions)

    val accept =
      actionButton(context, alert, "accept", "Accept", JobAlertTheme.SUCCESS)
    acceptButton = accept

    // Decline is the round ring button: tapping it declines, and its border
    // fills red as the offer window drains (see [RingButtonView]).
    val decline =
      RingButtonView(context).apply {
        contentDescription = "${alert.serviceName.ifBlank { "job" }} — Decline"
        setOnClickListener {
          val pending = pendingActionIntent(context, alert, "decline")
          runCatching { pending.send() }
        }
      }
    ringButton = decline

    actions.addView(
      decline,
      LinearLayout.LayoutParams(dp(52), dp(52)).apply { marginEnd = dp(12) },
    )
    actions.addView(
      accept,
      LinearLayout.LayoutParams(0, dp(52), 1f),
    )

    if (countdown != null && deadline != null) {
      countdownTextView = countdown
      startCountdown(countdown, deadline)
    }

    root.addView(card)

    viewAll?.let { link ->
      root.addView(
        link,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply {
          topMargin = dp(8)
          leftMargin = dp(20)
          rightMargin = dp(20)
        },
      )
    }

    return root
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
      // When the alert carried an offer token the receiver redeems it directly
      // over the API; otherwise it records the choice for the in-app ring.
      // Everything downstream lives in JobAlertActionReceiver, so this stays a
      // single fast PendingIntent send regardless of which path applies.
      setOnClickListener {
        val pending = pendingActionIntent(context, alert, action)
        runCatching { pending.send() }
      }
    }
  }

  private fun pendingActionIntent(context: Context, alert: IncomingJobAlert, action: String): PendingIntent {
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
      "job-alert-$action-${alert.jobId.hashCode()}".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Opens the combined incoming-jobs route, which lists every persisted offer. */
  private fun openIncomingJobs(context: Context) {
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse(JOB_OFFERS_DEEP_LINK))
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
    val pending = PendingIntent.getActivity(context, "incoming-jobs-entry".hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    runCatching { pending.send() }
  }

  /**
   * Ticks the "Expires in mm:ss" line once a second until the deadline, while
   * the red ring fills in step — empty on arrival, fully red at expiry.
   */
  private fun startCountdown(textView: TextView, deadlineMillis: Long) {
    val totalMillis = (deadlineMillis - System.currentTimeMillis()).coerceAtLeast(1L)
    val runnable =
      object : Runnable {
        override fun run() {
          val remaining = deadlineMillis - System.currentTimeMillis()
          if (remaining <= 0) {
              textView.text = "Offer expired"
              textView.setTextColor(JobAlertTheme.DANGER)
              ringButton?.setProgress(1f)
            lockButtons()
            return
          }
          textView.text = "Expires in ${formatCountdown(remaining)}"
          ringButton?.setProgress(1f - remaining.toFloat() / totalMillis)
          handler.removeCallbacks(this)
          handler.postDelayed(this, 500L)
        }
      }
    tickRunnable = runnable
    handler.removeCallbacks(runnable)
    handler.post(runnable)
  }

  private fun formatCountdown(millis: Long): String {
    val totalSeconds = (millis + 999) / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds)
  }

  /** Disables the tap targets once the offer can no longer be redeemed. */
  private fun lockButtons() {
    acceptButton?.alpha = 0.45f
    ringButton?.alpha = 0.45f
    acceptButton?.setOnClickListener(null)
    ringButton?.setOnClickListener(null)
  }

  private fun gradient(cornerRadius: Float, color: Int): GradientDrawable =
    GradientDrawable().apply {
      this.cornerRadius = cornerRadius
      setColor(color)
    }
}