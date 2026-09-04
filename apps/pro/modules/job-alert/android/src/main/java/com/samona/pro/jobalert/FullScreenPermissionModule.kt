package com.samona.pro.jobalert

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MODULE_NAME = "SamonaFullScreenIntent"

/**
 * Android 14+ "full screen content" role control.
 *
 * API 34 introduced an opt-in: even though USE_FULL_SCREEN_INTENT is declared,
 * a notification still needs the per-app "allow full screen" toggle before it
 * can cover other apps. There is no API to flip that toggle; the system hands
 * it to the user on the `Settings.MANAGE_APP_USE_FULL_SCREEN_INTENT` screen.
 * The JS layer opens this once, after sign-in, Rapido-style.
 */
class FullScreenPermissionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    /**
     * Whether full-screen alerts are currently allowed. Pre-34 this is always
     * true (declaring the permission is an install-time grant).
     */
    AsyncFunction("isAvailableAsync") { promise: Promise ->
      promise.resolve(isFullScreenIntentAllowed())
    }

    /**
     * Best-effort request for the Android 14+ role.
     *
     * Opens the system "Full screen content" screen for this app and resolves
     * true as soon as it launches (the outcome is read back later by
     * [isFullScreenIntentAllowed]). Resolves true without opening anything when
     * already allowed or on pre-14 devices.
     */
    AsyncFunction("requestAsync") { promise: Promise ->
      if (isFullScreenIntentAllowed()) {
        promise.resolve(true)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      val packageName = appContext.reactContext?.packageName
      if (activity == null || packageName == null) {
        // No foreground activity to launch from; try again next app open.
        promise.resolve(false)
        return@AsyncFunction
      }

      val intent =
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(Uri.parse("package:$packageName"))
      try {
        activity.startActivity(intent)
        promise.resolve(true)
      } catch (_: ActivityNotFoundException) {
        // A few OEMs omit this settings screen; the install-time permission
        // still allows full-screen on 13 and below, and declines silently here.
        promise.resolve(true)
      }
    }
  }

  private fun isFullScreenIntentAllowed(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return true
    }
    val context = appContext.reactContext ?: return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
    return manager.canUseFullScreenIntent()
  }
}