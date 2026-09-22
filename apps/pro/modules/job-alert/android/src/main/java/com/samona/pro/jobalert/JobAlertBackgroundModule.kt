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
     * Mirrors the app language (`en` / `te` / `hi`) onto native job-alert
     * strings. Persisted so a push that arrives while the process is dead
     * (which never sees JS) is still presented in the pro's language; existing
     * notification channels are renamed in place when the user switches
     * language in-session.
     */
    AsyncFunction("setLocale") { locale: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      AlertStore(context).setLocaleCode(locale.trim().take(2).ifBlank { "en" })
      AlertNotifications.updateChannelNames(context)
      JobAlertForegroundService.updateOnlineChannel(context)
      FloatingBubble.applyLocale(context)
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
        FloatingBubble.hideAll()
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
        // The ring and banner follow the remaining pending count: a cleared
        // offer never silences a still-pending request, and the banner is
        // re-presented for what remains unless the pro is on incoming-jobs.
        JobAlertOverlay.reconcile(context, store)
        AlertNotifications.cancel(context, jobId)
      }
      promise.resolve(true)
    }

    /**
     * Records (if new) and presents a customer-initiated cancellation of an
     * assigned job: the repeating cancellation vibration and, when
     * [showNotification] is set, the silent heads-up tray. Returns
     * `{ isNew }` — false when the socket already raised this exact
     * cancellation in-process, which is how the two surfaces deduplicate to a
     * single alert. The JS caller decides [showNotification] (foreground socket
     * path passes false; the JS modal is the foreground presentation).
     */
    AsyncFunction("presentCancellation") {
        jobId: String,
        cancelledAt: String,
        showNotification: Boolean,
        promise: Promise,
      ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("isNew" to false))
        return@AsyncFunction
      }
      val store = AlertStore(context)
      val isNew = store.setAssignmentCancellation(jobId, cancelledAt)
      if (isNew) {
        JobAlertCancellation.present(context, jobId)
        if (showNotification) AlertNotifications.postAssignmentCancellation(context, jobId)
      }
      promise.resolve(mapOf("isNew" to isNew))
    }

    /**
     * The unacknowledged customer cancellations native has recorded, newest
     * first. The JS layer rehydrates from here on mount and on every return to
     * the active AppState, so an alert raised while the process was alive
     * elsewhere (or delivered via a push the JS layer never saw) still surfaces.
     */
    AsyncFunction("getCancellations") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }
      promise.resolve(
        AlertStore(context)
          .loadAssignmentCancellations()
          .map { mapOf("jobId" to it.jobId, "cancelledAt" to it.cancelledAt) },
      )
    }

    /**
     * Acknowledges the cancellation for [jobId]: stops the vibration, drops the
     * tray entry and clears the native record so the pro is never shown the
     * same cancellation twice.
     */
    AsyncFunction("clearCancellation") { jobId: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      JobAlertCancellation.clear(context, jobId)
      AlertStore(context).clearAssignmentCancellation(jobId)
      promise.resolve(true)
    }

    /**
     * Route-aware UI suppression. JS tells native whether the `incoming-jobs`
     * route is active: the floating banner (which that route already replaces)
     * is hidden while suppressed, but the offers stay and the ring keeps
     * following the pending count. Unsuppressing restores the banner.
     */
    AsyncFunction("setOverlaySuppressed") { suppressed: Boolean, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      JobAlertOverlay.setSuppressed(context, suppressed)
      promise.resolve(true)
    }

    AsyncFunction("hasOverlayPermission") { promise: Promise ->
      val context = appContext.reactContext
      promise.resolve(context != null && Settings.canDrawOverlays(context))
    }

    /**
     * Opens the per-app "display over other apps" settings screen.
     *
     * The package-scoped `ACTION_MANAGE_OVERLAY_PERMISSION` is the exact "Appear
     * on top" page on stock Android, but a few OEM settings apps ignore the
     * package argument. When it does not resolve, fall back to the app's
     * Application-details page, where the toggle still lives.
     */
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
      val overlayIntent =
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val overlayLaunched = runCatching {
        context.startActivity(overlayIntent)
        true
      }.getOrDefault(false)
      if (overlayLaunched) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val detailsLaunched = runCatching {
        context.startActivity(
          Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${context.packageName}"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
      }.getOrDefault(false)
      promise.resolve(detailsLaunched)
    }

    /** Whether the online mirror expects the foreground service to be running. */
    AsyncFunction("isOnlineServiceRunning") { promise: Promise ->
      val context = appContext.reactContext
      promise.resolve(context != null && AlertStore(context).isOnline())
    }

    /**
     * Re-checks whether the floating Samona icon should be visible: shown only
     * while the pro is online AND has granted "display over other apps",
     * hidden otherwise. Called after any overlay-permission probe (app
     * foreground, device-setup "Check again"), so a grant while online brings
     * the icon up immediately and a revocation takes it down — without ever
     * looping the permission screen.
     */
    AsyncFunction("reconcileBubble") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      FloatingBubble.reconcile(context)
      promise.resolve(true)
    }
  }
}