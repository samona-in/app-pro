package com.samona.pro.devicereadiness

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MODULE_NAME = "SamonaDeviceReadiness"

/**
 * Android job-alert readiness: the OS settings that decide whether a push can
 * wake the app and raise a full-screen alert while the pro is not in the app.
 *
 * These are read-only probes plus "open the right settings screen" helpers.
 * Nothing here flips a system setting itself — an app is not allowed to — it
 * just gives the pro the shortest possible path to fix each one.
 */
class DeviceReadinessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    // --- Battery optimization ------------------------------------------------

    /**
     * True when the pro's app is exempt from battery optimization ("unrestricted").
     * OEMs kill background pushes for optimized apps, so the alert never surfaces.
     */
    AsyncFunction("isBatteryOptimizationIgnoredAsync") { promise: Promise ->
      promise.resolve(isBatteryOptimizationIgnored())
    }

    /**
     * Opens the system "Ignore battery optimization" confirmation for this app,
     * resolving true once the screen launches. Resolves true immediately when
     * the app is already exempt. The outcome is read back by the probe above.
     */
    AsyncFunction("requestIgnoreBatteryOptimizationsAsync") { promise: Promise ->
      if (isBatteryOptimizationIgnored()) {
        promise.resolve(true)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      val packageName = appContext.reactContext?.packageName
      if (activity == null || packageName == null) {
        promise.resolve(false)
        return@AsyncFunction
      }

      val intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
          .setData(Uri.parse("package:$packageName"))
      try {
        activity.startActivity(intent)
        promise.resolve(true)
      } catch (_: ActivityNotFoundException) {
        // Some OEMs drop this screen; the app details screen is still reachable.
        promise.resolve(false)
      }
    }

    // --- Background data -----------------------------------------------------

    /**
     * True when background data is not force-restricted for this app. With
     * restricted background data, a device that has not been touched for a while
     * may never receive the push that should raise a job alert.
     */
    AsyncFunction("isBackgroundDataAllowedAsync") { promise: Promise ->
      promise.resolve(isBackgroundDataAllowed())
    }

    /**
     * Opens this app's background-data usage setting, resolving true once the
     * screen launches. The pro flips "Allow background data" there.
     */
    AsyncFunction("openBackgroundDataSettingsAsync") { promise: Promise ->
      promise.resolve(openBackgroundDataSettings())
    }

    // --- Notifications -------------------------------------------------------

    /**
     * Opens this app's notifications setting. The pro re-enables notifications
     * (and, on Android 14+, the full-screen toggle) there.
     */
    AsyncFunction("openNotificationSettingsAsync") { promise: Promise ->
      promise.resolve(openNotificationSettings())
    }

    // --- OEM guide -----------------------------------------------------------

    /** Build.MANUFACTURER (e.g. "samsung", "xiaomi") — drives the per-OEM sleep-list guide. */
    Function("getManufacturer") { Build.MANUFACTURER }
  }

  private fun isBatteryOptimizationIgnored(): Boolean {
    val context = appContext.reactContext ?: return false
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun isBackgroundDataAllowed(): Boolean {
    val context = appContext.reactContext ?: return true
    val connectivityManager =
      context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
    // RESTRICT_BACKGROUND_STATUS_WHITELISTED and _ENABLED both let the alert
    // through; only _RESTRICTED puts background receives on hold.
    return connectivityManager.restrictBackgroundStatus !=
      ConnectivityManager.RESTRICT_BACKGROUND_STATUS_RESTRICTED
  }

  private fun openBackgroundDataSettings(): Boolean {
    val activity = appContext.currentActivity ?: return false
    val packageName = appContext.reactContext?.packageName ?: return false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      try {
        activity.startActivity(
          Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS)
            .setData(Uri.parse("package:$packageName")),
        )
        return true
      } catch (_: ActivityNotFoundException) {
        // Fall through to the generic app details screen.
      }
    }

    return startAppDetails(activity, packageName)
  }

  private fun openNotificationSettings(): Boolean {
    val activity = appContext.currentActivity ?: return false
    val packageName = appContext.reactContext?.packageName ?: return false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        activity.startActivity(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
        )
        return true
      } catch (_: ActivityNotFoundException) {
        // Fall through to the generic app details screen.
      }
    }

    return startAppDetails(activity, packageName)
  }

  private fun startAppDetails(activity: android.app.Activity, packageName: String): Boolean {
    return try {
      activity.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:$packageName")),
      )
      true
    } catch (_: ActivityNotFoundException) {
      false
    }
  }
}