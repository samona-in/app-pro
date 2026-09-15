package com.samona.pro.jobalert

import android.app.Activity
import android.app.Application
import android.os.Bundle

/**
 * Process-wide "is one of our activities visible on screen" flag.
 *
 * Maintained via [Application.ActivityLifecycleCallbacks]; the job-alert
 * messaging and foreground services register so they share one lifecycle
 * source. The flag follows [Activity.onStart] / [Activity.onStop] semantics —
 * "visible to the user" — and on every start/stop transition it reconciles the
 * floating Samona bubble ([FloatingBubble]) so the icon is never on screen
 * while the app is, and returns the moment the app leaves the screen. A paused
 * activity (notification shade, a dialog) is still visible, so no bubble.
 */
object AppForeground : Application.ActivityLifecycleCallbacks {
  @Volatile
  var isForeground = false
    private set

  private var registered = false

  /** Idempotent: the first caller to reach an Application registers once. */
  fun register(application: Application) {
    if (registered) return
    registered = true
    application.registerActivityLifecycleCallbacks(this)
  }

  override fun onActivityStarted(activity: Activity) {
    // The activity is becoming visible. Hide the bubble before the transition
    // completes so the app and the floating icon are never on screen together.
    if (isForeground) return
    isForeground = true
    FloatingBubble.reconcile(activity.applicationContext)
  }

  override fun onActivityStopped(activity: Activity) {
    // The activity is no longer visible. The bubble may come back for an online
    // pro. Edge-guarded so an onPause/onStop pair notifies exactly once.
    if (!isForeground) return
    isForeground = false
    FloatingBubble.reconcile(activity.applicationContext)
  }

  override fun onActivityResumed(activity: Activity) {}

  override fun onActivityPaused(activity: Activity) {}

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

  override fun onActivityDestroyed(activity: Activity) {}
}