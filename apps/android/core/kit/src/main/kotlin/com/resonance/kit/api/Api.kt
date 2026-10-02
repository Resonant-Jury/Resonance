package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.infrastructure.ClientError
import com.resonance.api.infrastructure.ClientException
import com.resonance.api.infrastructure.ServerException
import com.resonance.api.models.ApiError
import com.resonance.api.models.CardDetail
import com.resonance.api.models.ErrorCode
import com.resonance.api.models.FeedCard
import com.resonance.api.models.FeedPage
import com.resonance.api.models.Me
import com.resonance.api.models.Profile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Call
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
    /** A pen name someone else took (onboarding, a rename). */
    val isConflict get() = code == "conflict"
}

private val json = Json { ignoreUnknownKeys = true }

/**
 * The OkHttp call a coroutine is waiting on. A blocking `execute()` doesn't notice its coroutine
 * being cancelled, so [blocking] cancels the call itself: the request in flight stops, its
 * connection is let go, and the caller is free at once instead of after the server answers or
 * the read times out.
 */
internal class InFlight {
    private var call: Call? = null
    private var cancelled = false

    @Synchronized fun attach(call: Call) {
        this.call = call
        if (cancelled) call.cancel()
    }

    @Synchronized fun cancel() {
        cancelled = true
        call?.cancel()
    }

    companion object {
        /** The [InFlight] of the coroutine running on this thread (set by [blocking]). */
        val current = ThreadLocal<InFlight?>()

        /**
         * Hands each call to the coroutine that runs it. An application interceptor runs on the
         * thread that called `execute()`, which is the one [blocking] marked.
         */
        val interceptor = Interceptor { chain ->
            current.get()?.attach(chain.call())
            chain.proceed(chain.request())
        }
    }
}

/**
 * Runs blocking OkHttp work off the main thread; cancelling the caller cancels its call in flight.
 * The work hands back its outcome rather than failing, so the call's own "Canceled" never stands
 * in for the caller's cancellation.
 */
internal suspend fun <T> blocking(block: () -> T): T = coroutineScope {
    val inFlight = InFlight()
    val work = async(Dispatchers.IO) {
        InFlight.current.set(inFlight)
        try {
            runCatching(block)
        } finally {
            InFlight.current.remove()
        }
    }
    try {
        work.await().getOrThrow()
    } catch (e: CancellationException) {
        inFlight.cancel()
        throw e
    }
}

/**
 * The API's client on top of the app's one [http]: the ID token on every call (refreshed once on
 * a 401), and calls a coroutine's cancellation reaches.
 */
internal fun apiClient(http: OkHttpClient, configuration: ApiConfiguration): OkHttpClient =
    http.newBuilder().addInterceptor(InFlight.interceptor).addInterceptor(BearerAuthInterceptor(configuration.idToken)).build()

/** Runs a generated (blocking) call off the main thread, mapping errors to [ApiFailure]. */
internal suspend fun <T> call(block: () -> T): T = blocking {
    try {
        block()
    } catch (e: ClientException) {
        val body = (e.response as? ClientError<*>)?.body as? String
        val error = body?.let { runCatching { json.decodeFromString(ApiError.serializer(), it) }.getOrNull() }
        // A code newer than this build (the client's unknown case) is no code it can act on; its message still shows.
        val code = error?.error?.code?.takeIf { it != ErrorCode.unknownDefaultOpenApi }?.value ?: "unexpected"
        throw if (error != null) ApiFailure(code, error.error.message, e.statusCode)
        else ApiFailure("unexpected", "HTTP ${e.statusCode}", e.statusCode)
    } catch (e: ServerException) {
        throw ApiFailure("internal", "HTTP ${e.statusCode}", e.statusCode)
    }
}

/**
 * Where the next page of a list starts, as the page before it said ([next]): its page token, which
 * resumes exactly after its last card — or, from a server older than the token, its millisecond
 * cursor (cards published in that same millisecond can be skipped).
 */
data class NextPage(val token: String?, val cursor: String?)

/** Where this page's list goes on, by token when the page has one; null at its end. */
val FeedPage.next: NextPage?
    get() = when {
        nextPageToken != null -> NextPage(token = nextPageToken, cursor = null)
        nextCursor != null -> NextPage(token = null, cursor = nextCursor)
        else -> null
    }

/** The reading side of /api/v1 (feed, card page, author page, card box). */
class ReadingApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    suspend fun me(): Me = call { api.getMe() }
    /** The latest cards: the first page, or the one `after` names. */
    suspend fun feed(limit: Int = 12, after: NextPage? = null): FeedPage =
        call { api.getFeed(limit, after?.cursor?.let(OffsetDateTime::parse), after?.token) }
    suspend fun recommended(): List<FeedCard> = call { api.getRecommendedFeed().cards }
    /**
     * A card by slug or id, with its story — and, with `include`, the lists its page shows
     * (`resonances`, `related`, `links`, `embeds`), each as its own endpoint answers it.
     */
    suspend fun card(key: String, include: Collection<String> = emptyList()): CardDetail =
        call { api.getCard(key, include.takeIf { it.isNotEmpty() }?.joinToString(",")) }

    /**
     * Several cards by slug or id as list summaries (no story), in the order asked: those the
     * reader may not see (gone, hidden, blocked) are left out. The contract takes 30 a request,
     * so a longer list goes out in several, side by side; none go out for an empty one.
     */
    suspend fun cards(keys: Collection<String>): List<FeedCard> = coroutineScope {
        keys.distinct().chunked(CARDS_PER_REQUEST)
            .map { chunk -> async { call { api.getCards(chunk.joinToString(",")).cards } } }
            .awaitAll()
            .flatten()
    }
    suspend fun resonances(id: String): List<FeedCard> = call { api.getCardResonances(id).cards }
    suspend fun related(id: String): List<FeedCard> = call { api.getRelatedCards(id).cards }
    suspend fun links(id: String): List<FeedCard> = call { api.getCardLinks(id).cards }
    /**
     * A person's profile as the reader sees it — and, with `include`, what their `cards` (the first
     * page, of `limit`) and `links` endpoints answer.
     */
    suspend fun profile(handle: String, include: Collection<String> = emptyList(), limit: Int = 12): Profile {
        val lists = include.takeIf { it.isNotEmpty() }?.joinToString(",")
        return call { api.getProfile(handle, lists, if (lists != null) limit else null) }
    }
    suspend fun profileCards(handle: String, limit: Int = 12, after: NextPage? = null): FeedPage =
        call { api.getProfileCards(handle, limit, after?.cursor?.let(OffsetDateTime::parse), after?.token) }
    suspend fun profileLinks(handle: String): List<FeedCard> = call { api.getProfileLinks(handle).cards }
    suspend fun cardBox(tab: DefaultApi.TabGetCardBox): List<FeedCard> = call { api.getCardBox(tab).cards }

    companion object {
        /** GET /cards?keys= takes at most this many keys. */
        const val CARDS_PER_REQUEST = 30
    }
}
