package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.CreateReportRequest
import com.resonance.api.models.ReportCardRequest
import okhttp3.OkHttpClient

/**
 * Reports, through the contract: the server keeps a copy of what was reported
 * beside each one, so deleting it later erases no evidence. A card's report
 * (POST /api/v1/cards/{key}/report) has the server fill in the author, so
 * anonymous cards can be reported too — the app never knows who wrote them;
 * a person or a message goes to POST /api/v1/reports.
 */
class SafetyApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    /** Reports the card (`key`: its slug or id) for `reason` (the contract's key, e.g. "self_harm"); returns the report's id. */
    suspend fun reportCard(key: String, reason: String, detail: String?): String {
        val r = ReportCardRequest.Reason.entries.firstOrNull { it.value == reason } ?: throw IllegalArgumentException("reason: $reason")
        return call { api.reportCard(key, ReportCardRequest(reason = r, detail = detail?.takeIf { it.isNotBlank() })).id }
    }

    /** Reports a person (their profile, by user id); returns the report's id. */
    suspend fun reportUser(id: String, reason: String, detail: String?): String =
        report(CreateReportRequest.TargetType.user, id, null, reason, detail)

    /**
     * Reports a message someone sent you — `id` is the message's, or the conversation's own to
     * report the conversation as a whole (its other person, with its latest messages); returns the
     * report's id.
     */
    suspend fun reportMessage(id: String, conversationId: String, reason: String, detail: String?): String =
        report(CreateReportRequest.TargetType.message, id, conversationId, reason, detail)

    private suspend fun report(type: CreateReportRequest.TargetType, id: String, conversationId: String?, reason: String, detail: String?): String {
        val r = CreateReportRequest.Reason.entries.firstOrNull { it.value == reason } ?: throw IllegalArgumentException("reason: $reason")
        val body = CreateReportRequest(
            targetType = type,
            targetId = id,
            reason = r,
            conversationId = conversationId,
            detail = detail?.takeIf { it.isNotBlank() },
        )
        return call { api.createReport(body).id }
    }
}
