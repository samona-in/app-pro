package com.samona.updates

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallException
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallErrorCode
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch

private const val MODULE_NAME = "SamonaAppUpdates"

/**
 * Activity request codes. They are private to this module because every result
 * this module receives is routed back to it by Expo's activity-result bridge.
 */
private const val REQUEST_FLEXIBLE_UPDATE = 0x5A11
private const val REQUEST_IMMEDIATE_UPDATE = 0x5A12

/**
 * Google Play In-App Updates bridge.
 *
 * The Play Core API decides whether an update exists from the installed
 * `versionCode` and the Play Store listing — never from a version name and
 * never from a SAMONA backend flag. That means a release that keeps the same
 * user-visible version name but raises `versionCode` is still detected.
 *
 * The module owns the native work only:
 *  - `checkForUpdateAsync` reports availability, Play's update priority, the
 *    allowed update types and the current install state;
 *  - `startFlexibleUpdateAsync` starts Play's flexible flow and streams install
 *    progress through the `onInstallStateChanged` event;
 *  - `startImmediateUpdateAsync` starts Play's blocking immediate flow and
 *    resolves with its consent result;
 *  - `completeUpdateAsync` installs a downloaded flexible update and restarts
 *    the app through Play;
 *  - `getInstallStateAsync` re-reads a pending download on foreground, which
 *    is how a download that continued while the app was backgrounded (or
 *    killed) is surfaced again.
 *
 * The JS layer owns all product policy (which update type to offer, when to
 * prompt, dismissal memory) so both apps behave identically.
 */
class AppUpdatesModule : Module() {
  private var updateManager: AppUpdateManager? = null
  private var installListener: InstallStateUpdatedListener? = null
  private var waitingForImmediateResult: Promise? = null

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    Events("onInstallStateChanged", "onUpdateFlowResult")

    AsyncFunction("checkForUpdateAsync") { promise: Promise ->
      appContext.mainQueue.launch {
        val manager = manager()
        if (manager == null) {
          promise.resolve(unsupportedMap())
          return@launch
        }

        manager.getAppUpdateInfo()
          .addOnSuccessListener { info -> promise.resolve(describe(info)) }
          .addOnFailureListener { error -> promise.resolve(errorMap(error)) }
      }
    }

    AsyncFunction("getInstallStateAsync") { promise: Promise ->
      appContext.mainQueue.launch {
        val manager = manager()
        if (manager == null) {
          promise.resolve(installStateMap(InstallStatus.UNKNOWN, null, null, 0))
          return@launch
        }

        manager.getAppUpdateInfo()
          .addOnSuccessListener { info ->
            promise.resolve(
              installStateMap(
                status = info.installStatus(),
                bytesDownloaded = null,
                totalBytesToDownload = null,
                installErrorCode = 0,
              ),
            )
          }
          .addOnFailureListener { error ->
            promise.resolve(
              installStateMap(InstallStatus.FAILED, null, null, playErrorCode(error)),
            )
          }
      }
    }

    AsyncFunction("startFlexibleUpdateAsync") { promise: Promise ->
      appContext.mainQueue.launch {
        val manager = manager()
        val activity = appContext.currentActivity
        if (manager == null || activity == null) {
          promise.resolve(startResult(false, "noActivity"))
          return@launch
        }

        manager.getAppUpdateInfo()
          .addOnSuccessListener { info ->
            if (!isUpdateAvailable(info)) {
              promise.resolve(startResult(false, "notAvailable"))
              return@addOnSuccessListener
            }
            if (!info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
              promise.resolve(startResult(false, "notAllowed"))
              return@addOnSuccessListener
            }

            registerInstallListener(manager)
            val started = runCatching {
              manager.startUpdateFlowForResult(
                info,
                activity,
                AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                REQUEST_FLEXIBLE_UPDATE,
              )
            }.getOrDefault(false)

            promise.resolve(startResult(started, if (started) null else "startFailed"))
          }
          .addOnFailureListener { error ->
            promise.resolve(startResult(false, playErrorReason(error)))
          }
      }
    }

    AsyncFunction("startImmediateUpdateAsync") { promise: Promise ->
      appContext.mainQueue.launch {
        if (waitingForImmediateResult != null) {
          promise.resolve(mapOf("status" to "busy"))
          return@launch
        }

        val manager = manager()
        val activity = appContext.currentActivity
        if (manager == null || activity == null) {
          promise.resolve(mapOf("status" to "failed", "reason" to "noActivity"))
          return@launch
        }

        manager.getAppUpdateInfo()
          .addOnSuccessListener { info ->
            if (!isUpdateAvailable(info)) {
              promise.resolve(mapOf("status" to "notAvailable"))
              return@addOnSuccessListener
            }
            if (!info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
              promise.resolve(mapOf("status" to "notAllowed"))
              return@addOnSuccessListener
            }

            registerInstallListener(manager)
            waitingForImmediateResult = promise

            val started = runCatching {
              manager.startUpdateFlowForResult(
                info,
                activity,
                AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                REQUEST_IMMEDIATE_UPDATE,
              )
            }.getOrDefault(false)

            if (!started) {
              settleImmediate(mapOf("status" to "failed", "reason" to "startFailed"))
            }
          }
          .addOnFailureListener { error ->
            promise.resolve(
              mapOf("status" to "failed", "reason" to playErrorReason(error)),
            )
          }
      }
    }

    AsyncFunction("completeUpdateAsync") { promise: Promise ->
      appContext.mainQueue.launch {
        val manager = manager()
        if (manager == null) {
          promise.resolve(false)
          return@launch
        }

        manager.completeUpdate()
          .addOnSuccessListener { promise.resolve(true) }
          .addOnFailureListener { promise.resolve(false) }
      }
    }

    OnActivityResult { _, payload ->
      when (payload.requestCode) {
        REQUEST_IMMEDIATE_UPDATE -> {
          val status = when (payload.resultCode) {
            Activity.RESULT_OK -> "started"
            Activity.RESULT_CANCELED -> "cancelled"
            ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> "failed"
            else -> "failed"
          }
          settleImmediate(mapOf("status" to status))
        }

        REQUEST_FLEXIBLE_UPDATE -> {
          val status = when (payload.resultCode) {
            Activity.RESULT_OK -> "started"
            Activity.RESULT_CANCELED -> "cancelled"
            else -> "failed"
          }
          sendEvent(
            "onUpdateFlowResult",
            mapOf("updateType" to "flexible", "status" to status),
          )
        }
      }
    }

    OnDestroy {
      installListener?.let { listener -> updateManager?.unregisterListener(listener) }
      installListener = null
      waitingForImmediateResult?.let { promise ->
        waitingForImmediateResult = null
        promise.resolve(mapOf("status" to "cancelled"))
      }
    }
  }

  /** Creates the Play manager once per module instance. */
  private fun manager(): AppUpdateManager? {
    updateManager?.let { return it }
    val context = appContext.reactContext ?: return null
    val created = AppUpdateManagerFactory.create(context)
    updateManager = created
    return created
  }

  /**
   * One listener per module instance. Play Core keeps delivering state updates
   * after `startUpdateFlowForResult` returns, including after the app returns
   * to the foreground, so the listener stays registered until the module dies.
   */
  private fun registerInstallListener(manager: AppUpdateManager) {
    if (installListener != null) return
    val listener = InstallStateUpdatedListener { state -> sendEvent("onInstallStateChanged", stateMap(state)) }
    installListener = listener
    manager.registerListener(listener)
  }

  private fun settleImmediate(result: Map<String, Any?>) {
    val promise = waitingForImmediateResult ?: return
    waitingForImmediateResult = null
    promise.resolve(result)
  }

  /**
   * Play reports availability, the update priority (0–5, set on the release)
   * and which update types this device/account is allowed to use. The update
   * type itself is decided in JS so the policy lives in one place.
   */
  private fun describe(info: AppUpdateInfo): Map<String, Any?> = mapOf(
    "status" to when (info.updateAvailability()) {
      UpdateAvailability.UPDATE_AVAILABLE -> "available"
      UpdateAvailability.UPDATE_NOT_AVAILABLE -> "notAvailable"
      UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "inProgress"
      else -> "unknown"
    },
    "availableVersionCode" to info.availableVersionCode(),
    "updatePriority" to info.updatePriority(),
    "stalenessDays" to info.clientVersionStalenessDays(),
    "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
    "immediateAllowed" to info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
    "installStatus" to installStatusName(info.installStatus()),
  )

  private fun stateMap(state: InstallState): Map<String, Any?> = installStateMap(
    status = state.installStatus(),
    bytesDownloaded = state.bytesDownloaded(),
    totalBytesToDownload = state.totalBytesToDownload(),
    installErrorCode = state.installErrorCode(),
  )

  private fun installStateMap(
    status: Int,
    bytesDownloaded: Long?,
    totalBytesToDownload: Long?,
    installErrorCode: Int,
  ): Map<String, Any?> = mapOf(
    "status" to installStatusName(status),
    "bytesDownloaded" to bytesDownloaded,
    "totalBytesToDownload" to totalBytesToDownload,
    "installErrorCode" to installErrorCode,
  )

  @Suppress("DEPRECATION")
  private fun installStatusName(status: Int): String = when (status) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "canceled"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.REQUIRES_UI_INTENT -> "requiresUiIntent"
    else -> "unknown"
  }

  private fun isUpdateAvailable(info: AppUpdateInfo): Boolean =
    info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ||
      info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS

  private fun startResult(started: Boolean, reason: String?): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>("started" to started)
    if (reason != null) result["reason"] = reason
    return result
  }

  private fun unsupportedMap(): Map<String, Any?> = mapOf(
    "status" to "unsupported",
    "availableVersionCode" to 0,
    "updatePriority" to 0,
    "stalenessDays" to null,
    "flexibleAllowed" to false,
    "immediateAllowed" to false,
    "installStatus" to "unknown",
  )

  private fun errorMap(error: Throwable): Map<String, Any?> = mapOf(
    "status" to "error",
    "error" to playErrorReason(error),
    "message" to (error.message ?: ""),
    "availableVersionCode" to 0,
    "updatePriority" to 0,
    "stalenessDays" to null,
    "flexibleAllowed" to false,
    "immediateAllowed" to false,
    "installStatus" to "unknown",
  )

  /**
   * Maps Play Core's install exception to a stable code the UI can reason
   * about. `ERROR_APP_NOT_OWNED` is the "installed from somewhere other than
   * Play" case — sideloaded APKs and third-party stores.
   */
  private fun playErrorReason(error: Throwable): String {
    val installError = error as? InstallException ?: return "unavailable"
    return when (installError.errorCode) {
      InstallErrorCode.ERROR_PLAY_STORE_NOT_FOUND -> "playStoreNotFound"
      InstallErrorCode.ERROR_API_NOT_AVAILABLE -> "playServicesUnavailable"
      InstallErrorCode.ERROR_APP_NOT_OWNED -> "notInstalledFromPlay"
      InstallErrorCode.ERROR_INVALID_REQUEST -> "invalidRequest"
      InstallErrorCode.ERROR_INSTALL_NOT_ALLOWED -> "installNotAllowed"
      InstallErrorCode.ERROR_DOWNLOAD_NOT_PRESENT -> "downloadNotPresent"
      InstallErrorCode.ERROR_INSTALL_UNAVAILABLE -> "installUnavailable"
      else -> "unknown"
    }
  }

  private fun playErrorCode(error: Throwable): Int =
    (error as? InstallException)?.errorCode ?: -1
}
