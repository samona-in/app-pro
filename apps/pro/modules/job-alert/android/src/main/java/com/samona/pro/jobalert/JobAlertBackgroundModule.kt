package com.samona.pro.jobalert

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MODULE_NAME = "SamonaJobAlertBackground"

/**
 * JS bridge for the native job-alert machinery.
 *
 * Responsibilities:
 *  - mirror the pro's online status onto [JobAlertForegroundService]
 *    (start/stop; also flips the persisted online flag the [BootReceiver]
 *    uses) so a swiped-away app keeps receiving and raising NEW_JOB pushes;
 *  - hand native-persisted job alerts and the overlay's accept/decline choice
 *    back to JS (`getPendingJobs` / `consumePendingAction`) so the in-app ring
 *    can fetch the job and act — while the *native* overlay redeems the
 *    single-use offer token straight over the API when the push carried one
 *    (see [JobAlertActionReceiver]);
 *  - bind the install for that redemption: `configure(apiUrl)` tells native
 *    where the API lives and `getDeviceId()` returns the persistent per-install
 *    id that is sent with push-token registration and with every native
 *    offer call;
 *  - surface overlay permission state and request it (device-setup/readiness).
 */
class JobAlertBackgroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    /**
     * Configures the native side for direct offer redemption: the API base URL
     * (scheme://host[:port], no `/api/v1` suffix) used for Accept/Reject.
     * Called once at startup, before a NEW_JOB push can realistically arrive.
     */
    AsyncFunction("configure") { apiUrl: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      AlertStore(context).setApiUrl(apiUrl.trimEnd('/'))
      promise.resolve(true)
    }

    /**
     * The stable per-install device id, minted and persisted on first call.
     * Sending the same value the native overlay later redeems with is what
     * binds an offer token to one physical device.
     */
    AsyncFunction("getDeviceId") { promise: Promise ->
      val context = appContext.reactContext
      promise.resolve(context?.let { AlertStore(it).deviceId() } ?: "")
    }

    AsyncFunction("start") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      AlertStore(context).setOnline(true)
      val ok =
        runCatching {
          ContextCompat.startForegroundService(context, Intent(context, JobAlertForegroundService::class.java))
        }.isSuccess
      promise.resolve(ok)
    }

    AsyncFunction("stop") { promise: Promise ->
      val context = appContext.reactContext
      if (context != null) {
        // Going offline ends the native ring and any half-taken overlay choice:
        // a pending action must not fire after the pro stopped taking work.
        AlertStore(context).apply {
          setOnline(false)
          clearPendingAction()
        }
        JobAlertOverlay.hideAll()
        JobAlertSound.stop()
        runCatching {
          context.stopService(Intent(context, JobAlertForegroundService::class.java))
        }
      }
      promise.resolve(true)
    }

    /** Alerts the native side persisted for jobs the JS layer has not surfaced yet. */
    AsyncFunction("getPendingJobs") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }
      promise.resolve(AlertStore(context).loadJobs().map { it.toMap() })
    }

    /** Returns and clears the accept/decline the pro picked on the overlay. */
    AsyncFunction("consumePendingAction") { promise: Promise ->
      val context = appContext.reactContext
      val action = context?.let { AlertStore(it).consumePendingAction() }
      val result: Map<String, Any?> =
        action?.let { mapOf("jobId" to it.jobId, "action" to it.action) } ?: emptyMap()
      promise.resolve(result)
    }

    /** Drops a job alert from native storage, overlay and tray. */
    AsyncFunction("clearJobAlert") { jobId: String, promise: Promise ->
      val context = appContext.reactContext
      if (context != null) {
        val store = AlertStore(context)
        store.clearJob(jobId)
        store.clearPendingAction()
        JobAlertOverlay.hide(jobId)
        JobAlertSound.stop()
        AlertNotifications.cancel(context, jobId)
      }
      promise.resolve(true)
    }

    AsyncFunction("hasOverlayPermission") { promise: Promise ->
      val context = appContext.reactContext
      promise.resolve(context != null && Settings.canDrawOverlays(context))
    }

    /** Opens the per-app "display over other apps" settings screen. */
    AsyncFunction("requestOverlayPermission") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (Settings.canDrawOverlays(context)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val intent =
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val launched = runCatching { context.startActivity(intent) }.isSuccess
      promise.resolve(launched)
    }

    /** Whether the online mirror expects the foreground service to be running. */
    AsyncFunction("isOnlineServiceRunning") { promise: Promise ->
      val context = appContext.reactContext
      promise.resolve(context != null && AlertStore(context).isOnline())
    }
  }
}