package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.ApplyEditResponse
import com.resonance.api.models.PublishResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.Base64
import java.util.concurrent.TimeUnit

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

    /**
     * Applies your pending edit to your published card and clears it; its
     * date and slug stay (POST /api/v1/cards/{id}/edits/apply).
     */
    suspend fun applyEdit(cardId: String): ApplyEditResponse = call { api.applyCardEdit(cardId) }

    @Serializable private data class RevalidateBody(val paths: List<String>)

    /**
     * Asks the site to refresh its cached pages (/api/revalidate, e.g.
     * `/card/{slug}`, `/me`) after a change the site can't see — a grace
     * note, never awaited for success: a failure is dropped.
     */
    suspend fun revalidate(paths: List<String>) {
        try {
            post("api/revalidate", json.encodeToString(RevalidateBody.serializer(), RevalidateBody(paths)).toRequestBody(JSON))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // The cache entry simply ages out on its own.
        }
    }

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

    /** One line of /api/generate-image's progress stream (GenerateImageEvent). */
    sealed interface IllustrationEvent {
        /** The model's in-progress pass, a PNG. */
        class Partial(val png: ByteArray) : IllustrationEvent
        /** The stored picture. */
        data class Done(val url: String) : IllustrationEvent
        /** The server gave up after the stream began (the status is already 200 by then). */
        data object Failed : IllustrationEvent
    }

    @Serializable private data class StoryBody(val story: String)
    @Serializable private data class IllustrationLine(val type: String, val b64: String? = null, val publicUrl: String? = null)

    /**
     * A doodle-style illustration from the story (/api/generate-image): the
     * model's previews while it renders, then the stored picture — NDJSON,
     * read line by line as it arrives. Rendering can go quiet for a while, so
     * the read timeout is the route's own two minutes.
     */
    fun illustrate(story: String): Flow<IllustrationEvent> = flow {
        val body = json.encodeToString(StoryBody.serializer(), StoryBody(story)).toRequestBody(JSON)
        val url = configuration.origin.trimEnd('/') + "/api/generate-image"
        val slow = http.newBuilder().readTimeout(150, TimeUnit.SECONDS).build()
        slow.newCall(Request.Builder().url(url).post(body).build()).execute().use { r ->
            if (r.code == 401) throw ApiFailure("unauthenticated", "Sign in again.", 401)
            if (!r.isSuccessful) throw ApiFailure("unexpected", "HTTP ${r.code}", r.code)
            val source = r.body?.source() ?: return@flow
            while (true) {
                val text = source.readUtf8Line() ?: break
                if (text.isBlank()) continue
                val line = runCatching { json.decodeFromString(IllustrationLine.serializer(), text) }.getOrNull() ?: continue
                emit(
                    when (line.type) {
                        "partial" -> IllustrationEvent.Partial(line.b64?.let { runCatching { Base64.getDecoder().decode(it) }.getOrNull() } ?: continue)
                        "done" -> line.publicUrl?.let { IllustrationEvent.Done(it) } ?: IllustrationEvent.Failed
                        else -> IllustrationEvent.Failed
                    },
                )
            }
        }
    }.flowOn(Dispatchers.IO)

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
