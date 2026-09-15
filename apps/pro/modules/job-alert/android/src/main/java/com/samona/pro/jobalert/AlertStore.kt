package com.samona.pro.jobalert

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/**
 * The accept/decline intent the pro picked on the native [JobAlertOverlay].
 * Performed by the in-app ring for the authorized (or, when an offer token is
 * present, native direct) API call; native code never holds the main token.
 */
data class PendingAction(val jobId: String, val action: String, val offerToken: String? = null) {
  val isAccept: Boolean get() = action == "accept"
}

/**
 * A customer-initiated cancellation of a job the pro was assigned to.
 *
 * The native side persists it purely so "did the pro acknowledge this yet?" has
 * one cross-process source of truth: the socket while the app is alive and the
 * FCM push while it is backgrounded/killed both funnel through this record, and
 * whichever arrives first presents the single alert. `cancelledAt` is the
 * server-stamped timestamp shared by both surfaces, so the two can agree on one
 * logical (jobId, cancelledAt) event.
 */
data class AssignmentCancellation(val jobId: String, val cancelledAt: String) {
  fun toJson(): JSONObject = JSONObject().put("jobId", jobId).put("cancelledAt", cancelledAt)

  companion object {
    fun fromJson(json: JSONObject): AssignmentCancellation {
      val jobId = json.optString("jobId")
      val cancelledAt = json.optString("cancelledAt")
      return AssignmentCancellation(jobId, cancelledAt)
    }
  }
}

/**
 * Plain SharedPreferences store for native-side job alert state.
 *
 * Only non-sensitive metadata lives here: the job details the alert already
 * displayed, the user's accept/decline choice for the app to perform, the
 * online flag that lets the [BootReceiver] restart the foreground service
 * after a reboot, and — for the native direct Accept/Reject — the API base URL
 * JS configures and the per-install device id that binds offer tokens.
 * Writes are committed synchronously because they happen in broadcast
 * receivers and services that must not lose their write to process death.
 */
class AlertStore(context: Context) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /**
   * A stable per-install identifier used to bind single-use offer tokens to
   * this physical device. Minted once and persisted, so the value sent with
   * the FCM push-token registration is exactly the one the native overlay
   * later sends when redeeming an offer.
   */
  fun deviceId(): String {
    val existing = prefs.getString(KEY_DEVICE_ID, null)
    if (!existing.isNullOrBlank()) return existing
    val fresh = UUID.randomUUID().toString()
    prefs.edit().putString(KEY_DEVICE_ID, fresh).commit()
    return fresh
  }

  /** The API base URL (scheme://host[:port], no prefix) JS configures once. */
  fun apiUrl(): String = prefs.getString(KEY_API_URL, null).orEmpty()

  fun setApiUrl(url: String) {
    prefs.edit().putString(KEY_API_URL, url).commit()
  }

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

  fun setPendingAction(jobId: String, action: String, offerToken: String? = null) {
    val json =
      JSONObject()
        .put("jobId", jobId)
        .put("action", action)
        .apply { if (!offerToken.isNullOrBlank()) put("offerToken", offerToken) }
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
        if (jobId != null && action != null) {
          val offerToken =
            json.optString("offerToken").takeUnless { it.isBlank() || it == "null" }
          PendingAction(jobId, action, offerToken)
        } else {
          null
        }
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

  /**
   * Records that the customer cancelled an assigned job. Returns
   * `true` when the cancellation is new (not yet acknowledged) and `false`
   * when another venue already raised it — the single-alert deduplication
   * anchor the presentation layers rely on.
   */
  fun setAssignmentCancellation(jobId: String, cancelledAt: String): Boolean {
    val current = loadAssignmentCancellations()
    val isNew = current.none { it.jobId == jobId }
    if (isNew) {
      persistAssignments(listOf(AssignmentCancellation(jobId, cancelledAt)) + current)
    }
    return isNew
  }

  fun loadAssignmentCancellations(): List<AssignmentCancellation> {
    val raw = prefs.getString(KEY_ASSIGNED_CANCELLATIONS, null) ?: return emptyList()
    return runCatching {
      val array = JSONArray(raw)
      (0 until array.length()).map { AssignmentCancellation.fromJson(array.getJSONObject(it)) }
    }.getOrDefault(emptyList())
  }

  fun clearAssignmentCancellation(jobId: String) {
    persistAssignments(loadAssignmentCancellations().filterNot { it.jobId == jobId })
  }

  fun clearAllAssignmentCancellations() {
    persistAssignments(emptyList())
  }

  private fun persistAssignments(items: List<AssignmentCancellation>) {
    val array = JSONArray()
    items.forEach { array.put(it.toJson()) }
    prefs.edit().putString(KEY_ASSIGNED_CANCELLATIONS, array.toString()).commit()
  }

  private companion object {
    const val PREFS_NAME = "samona_job_alerts"
    const val KEY_JOBS = "pending_jobs"
    const val KEY_ACTION = "pending_action"
    const val KEY_ONLINE = "online"
    const val KEY_DEVICE_ID = "device_id"
    const val KEY_API_URL = "api_url"
    const val KEY_ASSIGNED_CANCELLATIONS = "assigned_cancellations"
  }
}