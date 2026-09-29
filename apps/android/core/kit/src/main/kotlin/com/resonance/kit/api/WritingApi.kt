package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.PublishResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * What the writing screen asks of the server — the twin of iOS's WritingAPI:
 * publishing (the v1 contract), and the web editor's helpers it shares as
 * they are — AI tag suggestions, the publish panel's insight echo, and photo
 * uploads. Drafts themselves are the author's own documents and go straight
 * to Firestore, as on the web.
 */
class WritingApi(private val configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) {
    private val http = http.newBuilder().addInterceptor(BearerAuthInterceptor(configuration.idToken)).build()
    private val api = DefaultApi(configuration.apiUrl, this.http)

    /**
     * Publishes one of your cards: stamps it once, gives it its slug, and
     * connects a resonance to its original (POST /api/v1/cards/{id}/publish).
     */
    suspend fun publish(cardId: String): PublishResponse = call { api.publishCard(cardId) }

    @Serializable private data class TagsBody(val thoughtCore: String, val story: String, val tags: List<String>)
    @Serializable private data class TagsReply(val tags: List<String>)

    /** Two or three tags for the draft, informed by your tag history (/api/cards/tags). */
    suspend fun suggestTags(title: String, story: String, tags: List<String>): List<String> {
        val body = json.encodeToString(TagsBody.serializer(), TagsBody(title, story, tags))
        return json.decodeFromString(TagsReply.serializer(), post("api/cards/tags", body.toRequestBody(JSON)).decodeToString()).tags
    }

    @Serializable private data class InsightBody(val thoughtCore: String, val story: String)
    @Serializable private data class InsightReply(val coreInsight: String? = null)

    /** The publish panel's mirror moment: the draft's core insight, or null (/api/cards/insight). */
    suspend fun insight(title: String, story: String): String? {
        val body = json.encodeToString(InsightBody.serializer(), InsightBody(title, story))
        return json.decodeFromString(InsightReply.serializer(), post("api/cards/insight", body.toRequestBody(JSON)).decodeToString()).coreInsight
    }

    @Serializable private data class UploadReply(val publicUrl: String)

    /** Uploads an (already compressed) photo through /api/upload and returns its public URL. */
    suspend fun upload(image: ByteArray, filename: String, contentType: String = "image/jpeg"): String {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", filename, image.toRequestBody(contentType.toMediaType()))
            .build()
        return json.decodeFromString(UploadReply.serializer(), post("api/upload", form).decodeToString()).publicUrl
    }

    /** POSTs with the ID token (refreshed once on a 401 by the interceptor). */
    private suspend fun post(path: String, body: RequestBody): ByteArray = withContext(Dispatchers.IO) {
        val url = configuration.origin.trimEnd('/') + "/" + path
        http.newCall(Request.Builder().url(url).post(body).build()).execute().use { r ->
            if (r.code == 401) throw ApiFailure("unauthenticated", "Sign in again.", 401)
            if (!r.isSuccessful) throw ApiFailure("unexpected", "HTTP ${r.code}", r.code)
            r.body?.bytes() ?: ByteArray(0)
        }
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
        val JSON = "application/json".toMediaType()
    }
}
