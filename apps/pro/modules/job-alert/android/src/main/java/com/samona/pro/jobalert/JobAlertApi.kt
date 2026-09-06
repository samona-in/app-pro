package com.samona.pro.jobalert

import android.content.Context
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Minimal HTTPS client for the two native overlay redemption calls.
 *
 * The Android overlay's Accept/Reject are the only calls this makes — the job
 * was already shown by the push, so no authorization header exists and none is
 * needed: the offer token the server minted for this exact job + device *is*
 * the credential. The body is exactly what the server's `accept/reject
 * job-offer` schemas expect.
 *
 * Rule of thumb used by callers: an HTTP 2xx is success; 400/404/409/410/422
 * are terminal (the offer is dead — drop it locally); 429 and 5xx (or a
 * transport failure) are transient — keep the alert around so a repeat or a
 * repost can retry. A single background thread is plenty for overlay taps.
 */
object JobAlertApi {
  private const val PREFIX = "/api/v1"
  private const val CONNECT_TIMEOUT_MS = 5_000
  private const val READ_TIMEOUT_MS = 10_000

  private val executor = Executors.newSingleThreadExecutor()

  /** Outcome of one redemption call; [code] is -1 for a transport failure. */
  data class Result(val code: Int, val detail: String = "") {
    val ok: Boolean get() = code in 200..299

    /** True when retrying could still succeed (network/5xx/429) rather than being pointless. */
    val transient: Boolean
      get() =
        code == -1 ||
          code == 408 ||
          code == 425 ||
          code == 429 ||
          code >= 500
  }

  fun accept(context: Context, jobId: String, offerToken: String, onResult: (Result) -> Unit) {
    redeem(context, "accept", jobId, offerToken, onResult)
  }

  fun reject(context: Context, jobId: String, offerToken: String, onResult: (Result) -> Unit) {
    redeem(context, "reject", jobId, offerToken, onResult)
  }

  private fun redeem(
    context: Context,
    action: String,
    jobId: String,
    offerToken: String,
    onResult: (Result) -> Unit,
  ) {
    val apiUrl = AlertStore(context).apiUrl()
    if (apiUrl.isBlank()) {
      Log.w(JOB_ALERT_TAG, "No API URL configured — cannot $action job $jobId natively")
      onResult(Result(-1, "API URL not configured"))
      return
    }
    executor.execute {
      val result =
        post(
          "$apiUrl$PREFIX/jobs/${urlEncode(jobId)}/offers/$action",
          action,
          jobId,
          offerToken,
          context,
        )
      onResult(result)
    }
  }

  private fun post(
    url: String,
    action: String,
    jobId: String,
    offerToken: String,
    context: Context,
  ): Result {
    val deviceId = AlertStore(context).deviceId()
    val body = JSONObject()
      .put("offerToken", offerToken)
      .put("deviceId", deviceId)
      .toString()

    var connection: HttpURLConnection? = null
    return try {
      connection = URL(url).openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = CONNECT_TIMEOUT_MS
      connection.readTimeout = READ_TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Accept", "application/json")
      connection.setFixedLengthStreamingMode(body.toByteArray(Charsets.UTF_8).size)
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }

      val code = connection.responseCode
      val detail =
        runCatching {
          (if (code in 200..299) connection.inputStream else connection.errorStream)
            ?.bufferedReader()
            ?.use { it.readText() }
            ?.take(256)
        }.getOrNull() ?: ""
      Log.i(
        JOB_ALERT_TAG,
        "Offer $action job=$jobId -> HTTP $code device=$deviceId (${detail.take(120)})",
      )
      Result(code, detail)
    } catch (transport: Exception) {
      Log.w(JOB_ALERT_TAG, "Offer $action job=$jobId failed (${transport.javaClass.simpleName})", transport)
      Result(-1, transport.message ?: "transport error")
    } finally {
      connection?.disconnect()
    }
  }

  private fun urlEncode(value: String): String {
    return java.net.URLEncoder.encode(value, Charsets.UTF_8.name())
  }
}