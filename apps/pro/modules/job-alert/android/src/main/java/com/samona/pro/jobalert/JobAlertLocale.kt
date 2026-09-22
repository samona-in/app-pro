package com.samona.pro.jobalert

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build
import androidx.annotation.StringRes
import java.util.Locale

/**
 * Resolves native job-alert strings in the language the app is using.
 *
 * The pro app lets a user pick English / Telugu / Hindi and tells the native
 * side via `setLocale` (persisted in [AlertStore]). Everything the native layer
 * prints — channel names, tray actions, overlay countdown, bubble a11y — is
 * resolved from `values-*` string resources through the stored locale, so a
 * dead-process alert is presented in the same language as the UI. When no
 * locale was ever stored the device locale decides (default English resources
 * cover the rest).
 */
@SuppressLint("DiscouragedApi")
object JobAlertLocale {
  private fun toLocale(code: String?): Locale =
    when (code) {
      "te" -> Locale("te")
      "hi" -> Locale("hi")
      else -> Locale("en")
    }

  /** The stored app locale when present, otherwise the device's first locale. */
  fun locale(context: Context): Locale {
    val stored = AlertStore(context).localeCode()
    if (!stored.isNullOrBlank()) return toLocale(stored)
    return context.resources.configuration.locales[0]
  }

  /** The app's resources with the active locale applied, for any thread. */
  fun resources(context: Context): Resources {
    val locale = locale(context)
    val config = Configuration(context.resources.configuration)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      config.setLocales(android.os.LocaleList(locale))
    } else {
      config.setLocale(locale)
    }
    return context.createConfigurationContext(config).resources
  }

  fun string(context: Context, @StringRes res: Int): String = resources(context).getString(res)

  fun string(context: Context, @StringRes res: Int, vararg args: Any): String =
    resources(context).getString(res, *args)
}