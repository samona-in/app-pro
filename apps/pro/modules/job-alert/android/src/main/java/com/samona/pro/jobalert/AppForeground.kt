package com.samona.pro.jobalert

import android.app.Activity
import android.app.Application
import android.os.Bundle

/**
 * Process-wide "is one of our activities in the foreground" flag.
 *
 * Maintained via [Application.ActivityLifecycleCallbacks]; the job-alert
 * messaging and foreground services register so they share one lifecycle
 * source. A NEW_JOB push no longer consults it — the native overlay presents
 * in every app state, foreground included — but the flag stays for any
 * foreground-sensitive service logic and for `JobAlertForegroundService`.
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