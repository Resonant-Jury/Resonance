package com.resonance.kit.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.OffsetDateTime

/**
 * The account routes (they predate /api/v1 and stay as the web uses them):
 * scheduling or cancelling deletion, and exporting one's own writing. Same
 * ID token and 401 refresh as the v1 client — the twin of iOS's AccountAPI.
 * Whether a deletion is scheduled comes with the account (GET /api/v1/me's
 * `deletion`), not from here.
 */
class AccountApi(private val configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) {
    private val http = apiClient(http, configuration)

    @Serializable private data class Deletion(val requestedAt: String, val purgeAfter: String)
    @Serializable private data class DeletionBody(val deletion: Deletion? = null)

    /** Schedules deletion (7-day grace). The server revokes every session, so the app signs out right after. */
    suspend fun scheduleDeletion(): OffsetDateTime? = deletionCall("POST")

    suspend fun cancelDeletion() {
        deletionCall("DELETE")
    }

    /** Everything the person wrote, as the web's JSON backup. */
    suspend fun export(): ByteArray = send("GET", "api/account/export")

    private suspend fun deletionCall(method: String): OffsetDateTime? {
        val body = json.decodeFromString(DeletionBody.serializer(), send(method, "api/account/deletion").decodeToString())
        return body.deletion?.let { runCatching { OffsetDateTime.parse(it.purgeAfter) }.getOrNull() }
    }

    private suspend fun send(method: String, path: String): ByteArray = blocking {
        val url = configuration.origin.trimEnd('/') + "/" + path
        val body = if (method == "POST") ByteArray(0).toRequestBody() else null
        http.newCall(Request.Builder().url(url).method(method, body).build()).execute().use { r ->
            if (r.code == 401) throw ApiFailure("unauthenticated", "Sign in again.", 401)
            if (!r.isSuccessful) throw ApiFailure("unexpected", "HTTP ${r.code}", r.code)
            r.body?.bytes() ?: ByteArray(0)
        }
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
    }
}
