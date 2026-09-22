package com.samona.pro.jobalert

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import kotlin.math.roundToInt

/**
 * The circular floating Samona icon that stays with an online pro.
 *
 * The window is owned by [JobAlertForegroundService] (which only runs while the
 * pro is online), so the icon survives backgrounding and a swipe-from-Recents.
 * It is a small TYPE_APPLICATION_OVERLAY window above other apps: drag it to
 * either edge and it snaps sideways; a tap brings the app forward (the
 * single-task [MainActivity] is reordered, preserving navigation state).
 *
 * Native guards keep it honest:
 *  - [reconcile] is the single gate: the icon appears only when
 *    [AlertStore.isOnline], the overlay permission, and the app being off-screen
 *    ([AppForeground] follows the activity start/stop lifecycle) are all true —
 *    so the Samona app and the floating icon are never visible at the same time,
 *    and a grant while online shows it while a revocation hides it;
 *  - a tap hides the icon *before* the app opens, so nothing overlaps the open
 *    transition, and the icon returns automatically on the next onStop;
 *  - exactly one window exists at a time (`lock` + the live-view check);
 *  - the last resting position is persisted and re-clamped on-screen on restore.
 */
object FloatingBubble {
  private const val BUBBLE_SIZE_DP = 60
  private const val EDGE_MARGIN_DP = 8
  private const val SNAP_DURATION_MS = 220L
  private const val PREFS_NAME = "samona_floating_bubble"
  private const val KEY_X = "x"
  private const val KEY_Y = "y"

  private val lock = Any()
  private val handler = Handler(Looper.getMainLooper())

  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var snapAnimator: ValueAnimator? = null
  private var lastY = 0

  /**
   * Shows the bubble when the pro is online, has granted "display over other
   * apps", **and** the app itself is off-screen, and hides it otherwise. This
   * is the single gate, so a grant while online shows the icon, a revocation
   * hides it, and an app start/stop transition shows or hides it — the app and
   * the icon are never on screen at the same time. Idempotent and safe to call
   * from any thread; off-thread calls hop to the main handler like the other
   * window entry points in this package.
   */
  fun reconcile(context: Context) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      val appContext = context.applicationContext
      handler.post { reconcile(appContext) }
      return
    }
    synchronized(lock) {
      val application = context.applicationContext as? Application ?: return
      // Keep the visibility sensor alive so the foreground gate is real;
      // registration is idempotent and shared with the native services.
      AppForeground.register(application)
      val appVisible = AppForeground.isForeground
      if (!AlertStore(context).isOnline() || !Settings.canDrawOverlays(context) || appVisible) {
        hideLocked()
        return
      }
      showLocked(context)
    }
  }

  /** Removes the bubble entirely (offline, service teardown, permission loss). */
  fun hideAll() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      handler.post { hideAll() }
      return
    }
    synchronized(lock) { hideLocked() }
  }

  /**
   * Re-applies the a11y label when the app language changes mid-session. The
   * bubble is long-lived (unlike the transient overlay), so without this it
   * would keep announcing the old language until the next reconcile.
   */
  fun applyLocale(context: Context) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      handler.post { applyLocale(context) }
      return
    }
    bubbleView?.contentDescription =
      JobAlertLocale.string(context, R.string.bubble_online)
  }

  private fun showLocked(context: Context) {
    if (bubbleView != null) return
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    val density = context.resources.displayMetrics.density
    fun dp(value: Int): Int = (value * density).toInt()

    val size = dp(BUBBLE_SIZE_DP)
    val bounds = bounds(context, size)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Restore the last resting spot, clamped back on-screen; first run parks the
    // icon on the right edge, around 40% down, clear of the status bar.
    val restoredX = prefs.getInt(KEY_X, bounds.right)
    val x = if (restoredX in bounds.left..bounds.right) restoredX else bounds.right
    val defaultY = bounds.top + bounds.height() * 2 / 5
    val restoredY = prefs.getInt(KEY_Y, defaultY)
    lastY = if (restoredY in bounds.top..bounds.bottom) restoredY else defaultY
    prefs.edit().putInt(KEY_X, x).putInt(KEY_Y, lastY).commit()

    val view = ImageView(context).apply {
      setImageDrawable(context.packageManager.getApplicationIcon(context.packageName))
      // Fill the whole bubble with the icon and clip it to a circle using the
      // oval background's outline, so the image covers the disc edge to edge.
      scaleType = ImageView.ScaleType.CENTER_CROP
      clipToOutline = true
      background =
        GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(JobAlertTheme.SURFACE)
          setStroke(dp(2), JobAlertTheme.BRAND)
        }
      elevation = JobAlertTheme.CARD_ELEVATION
      contentDescription = JobAlertLocale.string(context, R.string.bubble_online)
    }

    // API 26+ overlays that draw over any app; earlier releases use the legacy
    // TYPE_PHONE, which is what the overlay permission gates there too. The
    // constant is deprecated in Java but remains the only pre-O option.
    @Suppress("DEPRECATION")
    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      }
    val params =
      WindowManager.LayoutParams(
        size,
        size,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.START
        this.x = x
        this.y = lastY
      }

    val added =
      runCatching { wm.addView(view, params) }.onFailure { t ->
        Log.w(JOB_ALERT_TAG, "Floating bubble add failed", t)
      }.isSuccess
    if (!added) return

    windowManager = wm
    bubbleView = view

    // Drag with the finger (window follows via updateViewLayout, clamped to the
    // screen); a release with little travel is a tap and opens the app.
    view.setOnTouchListener(
      object : View.OnTouchListener {
        private var downRawX = 0f
        private var downRawY = 0f
        private var startX = 0
        private var startY = 0
        private var dragging = false

        override fun onTouch(v: View, event: MotionEvent): Boolean {
          when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
              downRawX = event.rawX
              downRawY = event.rawY
              startX = params.x
              startY = params.y
              dragging = false
              return true
            }

            MotionEvent.ACTION_MOVE -> {
              val dx = event.rawX - downRawX
              val dy = event.rawY - downRawY
              val slop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
              if (!dragging && (dx * dx + dy * dy) > slop * slop) dragging = true
              if (!dragging) return false
              val b = bounds(context, size)
              params.x = clamp(startX + dx.roundToInt(), b.left, b.right)
              params.y = clamp(startY + dy.roundToInt(), b.top, b.bottom)
              lastY = params.y
              runCatching { wm.updateViewLayout(v, params) }
              return true
            }

            MotionEvent.ACTION_UP -> {
              if (dragging) snapToEdge(context, wm, v, params) else openApp(context)
              return true
            }

            MotionEvent.ACTION_CANCEL -> {
              // A cancelled gesture is not a tap; leave the bubble where it is.
              dragging = false
              return true
            }
          }
          return false
        }
      },
    )

    Log.i(JOB_ALERT_TAG, "Showing floating Samona bubble")
  }

  /** Drops and forgets the current window. */
  private fun hideLocked() {
    snapAnimator?.let { it.cancel() }
    snapAnimator = null
    val view = bubbleView ?: return
    bubbleView = null
    runCatching { windowManager?.removeView(view) }
    windowManager = null
  }

  /** Animates the bubble sideways to the nearer edge and remembers the resting spot. */
  private fun snapToEdge(
    context: Context,
    wm: WindowManager,
    view: View,
    params: WindowManager.LayoutParams,
  ) {
    val b = bounds(context, view.width)
    val screenCenter = context.resources.displayMetrics.widthPixels / 2
    val targetX = if (params.x + view.width / 2 < screenCenter) b.left else b.right
    val restingY = clamp(lastY, b.top, b.bottom)
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putInt(KEY_X, targetX)
      .putInt(KEY_Y, restingY)
      .commit()

    snapAnimator?.cancel()
    val animator =
      ValueAnimator.ofInt(params.x, targetX).apply {
        duration = SNAP_DURATION_MS
        interpolator = DecelerateInterpolator()
        addUpdateListener { value ->
          params.x = value.animatedValue as Int
          runCatching { wm.updateViewLayout(view, params) }
        }
        addListener(
          object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
              snapAnimator = null
            }
          },
        )
      }
    snapAnimator = animator
    animator.start()
  }

  /**
   * Brings the app forward, preserving the existing single-task instance's
   * state. When the activity was swiped away (the online service keeps the
   * process alive), this recreates it fresh. The icon is dropped first so the
   * app and the bubble never overlap — even mid open-transition; the app's
   * onStart later reconciles the (now absent) icon back to hidden.
   */
  private fun openApp(context: Context) {
    hideAll()
    val intent =
      Intent(Intent.ACTION_MAIN)
        .setComponent(ComponentName(context.packageName, "${context.packageName}.MainActivity"))
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
        )
    // A foreground-service overlay window counts as a visible window, so
    // starting the activity from this tap is a permitted background start.
    runCatching { context.startActivity(intent) }
  }

  /** The rectangle the bubble may rest in: an 8dp margin from each screen edge. */
  private fun bounds(context: Context, size: Int): Rect {
    val metrics = context.resources.displayMetrics
    val (topInset, bottomInset) = systemBarInsets(context)
    fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
    val margin = dp(EDGE_MARGIN_DP)
    return Rect(
      margin,
      topInset + margin,
      metrics.widthPixels - margin - size,
      metrics.heightPixels - bottomInset - margin - size,
    )
  }

  /**
   * Best-effort system-bar heights so the bubble never parks under the status
   * bar or the gesture area. Overlay windows receive no system-bar insets (they
   * draw over everything), so read the system dimension resources instead.
   */
  private fun systemBarInsets(context: Context): Pair<Int, Int> {
    fun dimension(id: String): Int {
      val resId = context.resources.getIdentifier(id, "dimen", "android")
      if (resId == 0) return 0
      return runCatching { context.resources.getDimensionPixelSize(resId) }.getOrDefault(0)
    }
    return dimension("status_bar_height") to dimension("navigation_bar_height")
  }

  private fun clamp(value: Int, min: Int, max: Int): Int =
    if (value < min) min else if (value > max) max else value
}