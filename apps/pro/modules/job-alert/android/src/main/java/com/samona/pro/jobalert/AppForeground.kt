package com.samona.pro.jobalert

import android.app.Activity
import android.app.Application
import android.os.Bundle

/**
 * Process-wide "is one of our activities in the foreground" flag.
 *
 * Maintained via [Application.ActivityLifecycleCallbacks] because the job-alert
 * messaging service may receive a push while the pro is backgrounded (recents
 * or swiped away — the online foreground service keeps the process alive). The
 * service reads this to decide whether a NEW_JOB push should auto-bring the app
 * forward: when the app is already on screen the started activity must NOT
 * contest the running ring, and when it is backgrounded the ring is exactly
 * what the push should surface.
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

  override fun onActivityResumed(activity: Activity) {
    isForeground = true
  }

  override fun onActivityStopped(activity: Activity) {
    isForeground = false
  }

  override fun onActivityPaused(activity: Activity) {
    isForeground = false
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

  override fun onActivityStarted(activity: Activity) {}

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

  override fun onActivityDestroyed(activity: Activity) {}
}