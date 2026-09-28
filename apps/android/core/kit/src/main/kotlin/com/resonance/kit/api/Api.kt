package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.infrastructure.ClientError
import com.resonance.api.infrastructure.ClientException
import com.resonance.api.infrastructure.ServerException
import com.resonance.api.models.ApiError
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Me
import com.resonance.api.models.Profile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.time.OffsetDateTime

/**
 * Where the API lives and how a request gets its credentials — the twin of
 * iOS's APIConfiguration. `idToken(forceRefresh)` returns the Firebase ID
 * token (null when signed out); it is asked again with `true` when the API
 * rejects a token.
 */
class ApiConfiguration(
    /** The site's origin, e.g. https://resonance-world.vercel.app (the client adds /api/v1). */
    val origin: String,
    val idToken: suspend (forceRefresh: Boolean) -> String?,
) {
    val apiUrl: String get() = origin.trimEnd('/') + "/api/v1"
}

/**
 * Adds `Authorization: Bearer <Firebase ID token>`. A rejected token (revoked,
 * or its account re-created) is refreshed once and the call retried.
 * OkHttp interceptors run on its own threads, so blocking here is fine.
 */
class BearerAuthInterceptor(private val idToken: suspend (Boolean) -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { idToken(false) } ?: return chain.proceed(chain.request())
        val response = chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
        if (response.code != 401) return response
        val fresh = runBlocking { runCatching { idToken(true) }.getOrNull() }
        if (fresh == null || fresh == token) return response
        response.close()
        return chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $fresh").build())
    }
}

/** A failed call as the UI needs it: the contract's error code and a message. */
data class ApiFailure(val code: String, override val message: String, val status: Int?) : Exception(message) {
    val isNotFound get() = code == "not_found"
    val isUnauthenticated get() = code == "unauthenticated"
}

private val json = Json { ignoreUnknownKeys = true }

/** Runs a generated (blocking) call off the main thread, mapping errors to [ApiFailure]. */
internal suspend fun <T> call(block: () -> T): T = withContext(Dispatchers.IO) {
    try {
        block()
    } catch (e: ClientException) {
        val body = (e.response as? ClientError<*>)?.body as? String
        val error = body?.let { runCatching { json.decodeFromString(ApiError.serializer(), it) }.getOrNull() }
        throw if (error != null) ApiFailure(error.error.code.value, error.error.message, e.statusCode)
        else ApiFailure("unexpected", "HTTP ${e.statusCode}", e.statusCode)
    } catch (e: ServerException) {
        throw ApiFailure("internal", "HTTP ${e.statusCode}", e.statusCode)
    }
}

/** The reading side of /api/v1 (feed, card page, author page, card box). */
class ReadingApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, http.newBuilder().addInterceptor(BearerAuthInterceptor(configuration.idToken)).build()),
    )

    suspend fun me(): Me = call { api.getMe() }
    suspend fun feed(limit: Int = 12, cursor: String? = null): FeedPage = call { api.getFeed(limit, cursor?.let(OffsetDateTime::parse)) }
    suspend fun recommended(): List<FeedCard> = call { api.getRecommendedFeed().cards }
    suspend fun card(key: String): CardDetail = call { api.getCard(key) }
    suspend fun resonances(id: String): List<FeedCard> = call { api.getCardResonances(id).cards }
    suspend fun related(id: String): List<FeedCard> = call { api.getRelatedCards(id).cards }
    suspend fun links(id: String): List<FeedCard> = call { api.getCardLinks(id).cards }
    suspend fun profile(handle: String): Profile = call { api.getProfile(handle) }
    suspend fun profileCards(handle: String, limit: Int = 12, cursor: String? = null): FeedPage =
        call { api.getProfileCards(handle, limit, cursor?.let(OffsetDateTime::parse)) }
    suspend fun profileLinks(handle: String): List<FeedCard> = call { api.getProfileLinks(handle).cards }
    suspend fun cardBox(tab: DefaultApi.TabGetCardBox): List<FeedCard> = call { api.getCardBox(tab).cards }
}
