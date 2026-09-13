package com.samona.pro.jobalert

import org.json.JSONObject

/**
 * A NEW_JOB alert as seen natively.
 *
 * Carries only what the server already sends to the device (no customer
 * identity by design) plus a local [receivedAt]. Persisted in the
 * [AlertStore] so a job alert survives the app being backgrounded, and
 * handed back to JS (`getPendingJobs`) so the in-app ring fetches the
 * full job from the server with the real token.
 *
 * [jobOfferToken] is the signed, single-use offer token the server minted
 * for this device. When present, the native overlay's Accept/Reject call the
 * API directly and [AlertStore.deviceId] authenticates the call; when absent
 * (legacy server or a non-FCM delivery) the overlay falls back to recording a
 * [PendingAction] and opening the app, which performs the authorized call.
 */
data class IncomingJobAlert(
  val jobId: String,
  val title: String,
  val serviceName: String,
  val serviceCategory: String,
  val address: String,
  val distanceMeters: String?,
  val amountPaise: String?,
  val expiresAt: String?,
  val professionalId: String?,
  val jobOfferToken: String?,
  val offerExpiresAt: String?,
  val receivedAt: Long,
) {
  val hasOfferToken: Boolean get() = !jobOfferToken.isNullOrBlank()

  /** "AC installation" — the category within the service, blank when absent. */
  fun categoryLabel(): String? = serviceCategory.takeIf { it.isNotBlank() }

  /** Millis the offer stops being redeemable; null when the token is absent. */
  fun offerExpiresAtMillis(): Long? = parseIsoMillis(offerExpiresAt)

  /** Job-level expiry (payload always sends one); the fallback when no offer token exists. */
  fun jobExpiryMillis(): Long? = parseIsoMillis(expiresAt)

  /**
   * How long the native overlay and its ring should stay up: the remaining time
   * until the offer stops being redeemable. Thus the presentation is exactly as
   * long as the offer the server minted (JOB_OFFER_TTL_MS, 90s by default) —
   * the same truth the "Expires in" countdown counts to — instead of an
   * arbitrary fixed cap. Falls back to the job-level expiry, then to
   * [DEFAULT_PRESENTATION_MS] when the payload carries no deadline at all, and
   * clamps to [MAX_PRESENTATION_MS] so a corrupt deadline cannot ring forever.
   */
  fun presentationDurationMs(): Long {
    val deadline = offerExpiresAtMillis() ?: jobExpiryMillis() ?: return DEFAULT_PRESENTATION_MS
    return (deadline - System.currentTimeMillis()).coerceIn(0L, MAX_PRESENTATION_MS)
  }

  val isExpired: Boolean
    get() {
      val expiry = jobExpiryMillis() ?: return false
      return expiry < System.currentTimeMillis()
    }

  /** "1.2 km away" (or "850 m away") shown on the overlay. */
  fun distanceLabel(): String? {
    val meters = distanceMeters?.toIntOrNull() ?: return null
    return if (meters >= 1000) {
      String.format(java.util.Locale.US, "%.1f km away", meters / 1000.0)
    } else {
      "$meters m away"
    }
  }

  /** "₹150", the job's base pay shown on the overlay. */
  fun amountLabel(): String? {
    val paise = amountPaise?.toLongOrNull() ?: return null
    return "₹${(paise + 99) / 100}"
  }

  /** One compact secondary line, e.g. "1.2 km away · ₹150". */
  fun metaLine(): String {
    return listOfNotNull(distanceLabel(), amountLabel()).joinToString(separator = " · ")
  }

  fun toJson(): JSONObject =
    JSONObject().apply {
      put("jobId", jobId)
      put("title", title)
      put("serviceName", serviceName)
      put("serviceCategory", serviceCategory)
      put("address", address)
      put("distanceMeters", distanceMeters ?: JSONObject.NULL)
      put("amountPaise", amountPaise ?: JSONObject.NULL)
      put("expiresAt", expiresAt ?: JSONObject.NULL)
      put("professionalId", professionalId ?: JSONObject.NULL)
      put("jobOfferToken", jobOfferToken ?: JSONObject.NULL)
      put("offerExpiresAt", offerExpiresAt ?: JSONObject.NULL)
      put("receivedAt", receivedAt)
    }

  /** Plain map for serialization to JS from an expo module function. */
  fun toMap(): Map<String, Any?> =
    mapOf(
      "jobId" to jobId,
      "title" to title,
      "serviceName" to serviceName,
      "serviceCategory" to serviceCategory,
      "address" to address,
      "distanceMeters" to distanceMeters,
      "amountPaise" to amountPaise,
      "expiresAt" to expiresAt,
      "professionalId" to professionalId,
      "jobOfferToken" to jobOfferToken,
      "offerExpiresAt" to offerExpiresAt,
      "receivedAt" to receivedAt,
    )

  companion object {
    // 90s: the server's JOB_OFFER_TTL_MS default, used when the payload carries
    // no deadline to count down to.
    private const val DEFAULT_PRESENTATION_MS = 90_000L
    // The server's JOB_OFFER_TTL_MS ceiling; a sane upper bound on the ring.
    private const val MAX_PRESENTATION_MS = 600_000L

    // From `new Date().toISOString()` (e.g. 2026-09-06T12:34:56.789Z). Parsed
    // with SimpleDateFormat, not java.time, which is unavailable below API 26.
    private fun parseIsoMillis(raw: String?): Long? =
      raw?.let { value ->
        runCatching {
          java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
            .parse(value)?.time
        }.getOrNull()
      }

    fun fromJson(json: JSONObject): IncomingJobAlert =
      IncomingJobAlert(
        jobId = json.getString("jobId"),
        title = json.optString("title"),
        serviceName = json.optString("serviceName"),
        serviceCategory = json.optString("serviceCategory"),
        address = json.optString("address"),
        distanceMeters = json.optString("distanceMeters").nullable(),
        amountPaise = json.optString("amountPaise").nullable(),
        expiresAt = json.optString("expiresAt").nullable(),
        professionalId = json.optString("professionalId").nullable(),
        jobOfferToken = json.optString("jobOfferToken").nullable(),
        offerExpiresAt = json.optString("offerExpiresAt").nullable(),
        receivedAt = json.optLong("receivedAt", System.currentTimeMillis()),
      )

    fun fromFcmData(jobId: String, data: Map<String, String>, receivedAt: Long): IncomingJobAlert =
      IncomingJobAlert(
        jobId = jobId,
        title = data["title"].orEmpty(),
        serviceName = data["serviceName"].orEmpty(),
        serviceCategory = data["serviceCategory"].orEmpty(),
        address = data["address"].orEmpty(),
        distanceMeters = data["distanceMeters"]?.nullable(),
        amountPaise = data["amountPaise"]?.nullable(),
        expiresAt = data["expiresAt"]?.nullable(),
        professionalId = data["professionalId"]?.nullable(),
        jobOfferToken = data["jobOfferToken"]?.nullable(),
        offerExpiresAt = data["offerExpiresAt"]?.nullable(),
        receivedAt = receivedAt,
      )

    // JSON nulls surface as the literal "null"; treat it as absent.
    private fun String.nullable(): String? = takeUnless { it.isBlank() || it == "null" }
  }
}