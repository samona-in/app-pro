package com.samona.pro.jobalert

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * The accept/decline intent the pro picked on the native [JobAlertOverlay].
 * The in-app ring performs the actual (authorized) API call once the app is
 * up; native code never holds the token, so it never calls the API itself.
 */
data class PendingAction(val jobId: String, val action: String) {
  val isAccept: Boolean get() = action == "accept"
}

/**
 * Plain SharedPreferences store for native-side job alert state.
 *
 * Only non-sensitive metadata lives here: the job details the alert already
 * displayed, the user's accept/decline choice for the app to perform, and the
 * online flag that lets the [BootReceiver] restart the foreground service
 * after a reboot. Writes are committed synchronously because they happen in
 * broadcast receivers and services that must not lose their write to process
 * death.
 */
class AlertStore(context: Context) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /** Adds the alert at the front, or replaces the existing copy for that job. True when new. */
  fun addOrReplace(alert: IncomingJobAlert): Boolean {
    val jobs = loadJobs().toMutableList()
    val existingIndex = jobs.indexOfFirst { it.jobId == alert.jobId }
    val isNew = existingIndex < 0
    if (isNew) jobs.add(0, alert) else jobs[existingIndex] = alert
    persist(jobs)
    return isNew
  }

  fun loadJobs(): List<IncomingJobAlert> {
    val raw = prefs.getString(KEY_JOBS, null) ?: return emptyList()
    return runCatching {
      val array = JSONArray(raw)
      (0 until array.length()).map { IncomingJobAlert.fromJson(array.getJSONObject(it)) }
    }.getOrDefault(emptyList())
  }

  fun clearJob(jobId: String) {
    persist(loadJobs().filterNot { it.jobId == jobId })
  }

  fun clearAll() {
    persist(emptyList())
  }

  private fun persist(jobs: List<IncomingJobAlert>) {
    val array = JSONArray()
    jobs.forEach { array.put(it.toJson()) }
    prefs.edit().putString(KEY_JOBS, array.toString()).commit()
  }

  fun setPendingAction(jobId: String, action: String) {
    val json = JSONObject().put("jobId", jobId).put("action", action)
    prefs.edit().putString(KEY_ACTION, json.toString()).commit()
  }

  /** Returns and clears the recorded accept/decline intent, if any. */
  fun consumePendingAction(): PendingAction? {
    val raw = prefs.getString(KEY_ACTION, null) ?: return null
    val parsed =
      runCatching {
        val json = JSONObject(raw)
        val jobId = json.optString("jobId").takeIf { it.isNotBlank() }
        val action = json.optString("action").takeIf { it.isNotBlank() }
        if (jobId != null && action != null) PendingAction(jobId, action) else null
      }.getOrNull()
    prefs.edit().remove(KEY_ACTION).commit()
    return parsed
  }

  fun clearPendingAction() {
    prefs.edit().remove(KEY_ACTION).commit()
  }

  fun setOnline(online: Boolean) {
    prefs.edit().putBoolean(KEY_ONLINE, online).commit()
  }

  fun isOnline(): Boolean = prefs.getBoolean(KEY_ONLINE, false)

  private companion object {
    const val PREFS_NAME = "samona_job_alerts"
    const val KEY_JOBS = "pending_jobs"
    const val KEY_ACTION = "pending_action"
    const val KEY_ONLINE = "online"
  }
}