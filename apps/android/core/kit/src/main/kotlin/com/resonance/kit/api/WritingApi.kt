package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.ApplyEditResponse
import com.resonance.api.models.FeedCard
import com.resonance.api.models.PublishResponse
import com.resonance.api.models.ResonateRequest
import com.resonance.api.models.ResonateResponse
import com.resonance.api.models.UpdateCardRequest
import kotlinx.coroutines.channels.trySendBlocking
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
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
 * publishing and the card box's changes to a card (the v1 contract), and the
 * web editor's helpers it shares as they are — AI tag suggestions, the publish
 * panel's insight echo, and photo uploads. Drafts themselves are the author's
 * own documents and go straight to Firestore, as on the web.
 */
class WritingApi(private val configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) {
    private val http = apiClient(http, configuration)
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

    /**
     * The card box's ⋯ on one of your cards: its visibility (`public`, `connections`, `private`)
     * and/or its byline — null leaves one as it is (PATCH /api/v1/cards/{id}). The server keeps a
     * pending edit in step and refreshes the site's cached pages. Answers the card as your card
     * box shows it; someone else's card is `not_found`.
     */
    suspend fun updateCard(cardId: String, visibility: String? = null, anonymous: Boolean? = null): FeedCard {
        val level = visibility?.let { v -> UpdateCardRequest.Visibility.entries.firstOrNull { it.value == v } ?: throw IllegalArgumentException("visibility: $v") }
        return call { api.updateCard(cardId, UpdateCardRequest(visibility = level, anonymous = anonymous)) }
    }

    /**
     * Deletes one of your cards, draft or published, with its pending edit (DELETE
     * /api/v1/cards/{id}); the server refreshes the site's cached pages. A card already gone
     * counts as deleted — a retry after a lost answer is the server's 404.
     */
    suspend fun deleteCard(cardId: String) {
        try {
            call { api.deleteCard(cardId) }
        } catch (e: ApiFailure) {
            if (!e.isNotFound) throw e
        }
    }

    /**
     * Makes one of your published public cards ([cardId]) a resonance of the card [targetId] — the
     * picker's "pick one you've written" (POST /api/v1/cards/{targetId}/resonances). Answers your
     * card as your card box shows it, and whether anything changed (`false`: it already answered
     * this card, and no one was rung again). A card already answering another card — or another
     * of yours already answering this one — is `conflict`.
     */
    suspend fun resonate(targetId: String, cardId: String): ResonateResponse =
        call { api.resonateWithCard(targetId, ResonateRequest(cardId = cardId)) }

    /**
     * Your card [cardId] stops answering [targetId] and stays a card of its own (DELETE
     * /api/v1/cards/{targetId}/resonances/{cardId}); asking again when it no longer does is no
     * failure.
     */
    suspend fun unresonate(targetId: String, cardId: String) {
        call { api.unresonateCard(targetId, cardId) }
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

    /**
     * Uploads an (already compressed) photo through /api/upload and returns its public URL. With a
     * [purpose] (`avatar`: a profile photo, which the server fits to 256) the form says so.
     */
    suspend fun upload(image: ByteArray, filename: String, contentType: String = "image/jpeg", purpose: String? = null): String {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", filename, image.toRequestBody(contentType.toMediaType()))
            .apply { if (purpose != null) addFormDataPart("purpose", purpose) }
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
    fun illustrate(story: String): Flow<IllustrationEvent> = channelFlow {
        val body = json.encodeToString(StoryBody.serializer(), StoryBody(story)).toRequestBody(JSON)
        val url = configuration.origin.trimEnd('/') + "/api/generate-image"
        val slow = http.newBuilder().readTimeout(150, TimeUnit.SECONDS).build()
        // Read on the IO pool; the collector stopping (the writer closed) stops the stream at once.
        blocking {
            slow.newCall(Request.Builder().url(url).post(body).build()).execute().use { r ->
                if (r.code == 401) throw ApiFailure("unauthenticated", "Sign in again.", 401)
                if (!r.isSuccessful) throw ApiFailure("unexpected", "HTTP ${r.code}", r.code)
                val source = r.body?.source() ?: return@blocking
                while (true) {
                    val text = source.readUtf8Line() ?: break
                    if (text.isBlank()) continue
                    val line = runCatching { json.decodeFromString(IllustrationLine.serializer(), text) }.getOrNull() ?: continue
                    val event = when (line.type) {
                        "partial" -> IllustrationEvent.Partial(line.b64?.let { runCatching { Base64.getDecoder().decode(it) }.getOrNull() } ?: continue)
                        "done" -> line.publicUrl?.let { IllustrationEvent.Done(it) } ?: IllustrationEvent.Failed
                        else -> IllustrationEvent.Failed
                    }
                    trySendBlocking(event)
                }
            }
        }
    }

    /** POSTs with the ID token (refreshed once on a 401 by the interceptor). */
    private suspend fun post(path: String, body: RequestBody): ByteArray = blocking {
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
