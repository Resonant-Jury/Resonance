package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.ReportCardRequest
import okhttp3.OkHttpClient

/**
 * Reporting a card through the contract (POST /api/v1/cards/{key}/report):
 * the server fills in the author, so anonymous cards can be reported too —
 * the app never knows who wrote them.
 */
class SafetyApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, http.newBuilder().addInterceptor(BearerAuthInterceptor(configuration.idToken)).build()),
    )

    /** Reports the card (`key`: its slug or id) for `reason` (the contract's key, e.g. "self_harm"); returns the report's id. */
    suspend fun reportCard(key: String, reason: String, detail: String?): String {
        val r = ReportCardRequest.Reason.entries.firstOrNull { it.value == reason } ?: throw IllegalArgumentException("reason: $reason")
        return call { api.reportCard(key, ReportCardRequest(reason = r, detail = detail?.takeIf { it.isNotBlank() })).id }
    }
}
