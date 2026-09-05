package com.samona.pro.jobalert

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MODULE_NAME = "SamonaJobAlertBackground"

/**
 * JS bridge for the online foreground service ([JobAlertForegroundService]).
 *
 * The JS "online status" layer starts it when the pro goes online (or is found
 * online on a fresh launch) and stops it when they go offline or sign out.
 * Starting is the app's single most foreground interaction, so Android's
 * background-start restriction does not apply; failures still resolve `false`
 * rather than throw.
 */
class JobAlertBackgroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    AsyncFunction("start") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val intent = Intent(context, JobAlertForegroundService::class.java)
      val ok = runCatching { ContextCompat.startForegroundService(context, intent) }.isSuccess
      promise.resolve(ok)
    }

    AsyncFunction("stop") { promise: Promise ->
      val context = appContext.reactContext
      if (context != null) {
        runCatching {
          context.stopService(Intent(context, JobAlertForegroundService::class.java))
        }
      }
      promise.resolve(true)
    }
  }
}