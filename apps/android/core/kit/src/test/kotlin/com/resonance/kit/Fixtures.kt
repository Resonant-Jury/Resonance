package com.resonance.kit

import com.resonance.api.models.FeedCard
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

internal fun authorJson(id: String) = """
    {"id":"$id","handle":"$id","initials":"BO","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":false,"region":null}
""".trimIndent()

/** A card as the API lists it. */
internal fun cardJson(id: String, slug: String? = null, authorId: String = "bob") = """
    {"id":"$id","slug":${slug?.let { "\"$it\"" } ?: "null"},"title":"Card $id","excerpt":"…","tags":[],
     "publishedAt":"2026-09-01T08:00:00.000Z","author":${authorJson(authorId)},
     "anonymous":false,"visibility":"public","imageUrl":null,"imageLabel":null,"accentHue":140,
     "readMinutes":2,"referenceCardId":null,"reason":null}
""".trimIndent()

internal fun listJson(vararg ids: String) = """{"cards":[${ids.joinToString(",") { cardJson(it) }}]}"""

internal fun pageJson(vararg ids: String, cursor: String? = null) =
    """{"cards":[${ids.joinToString(",") { cardJson(it) }}],"nextCursor":${cursor?.let { "\"$it\"" } ?: "null"}}"""

internal fun detailJson(id: String, slug: String?, owner: Boolean = false) = """
    {"card":${cardJson(id, slug)},"story":"# Hello","visibility":"public","anonymous":false,"resonanceCount":1,
     "coreInsight":null,"isOwner":$owner,"referenceCard":null}
""".trimIndent()

internal fun feedCard(id: String, slug: String? = null, authorId: String = "bob"): FeedCard =
    Json { ignoreUnknownKeys = true }.decodeFromString(FeedCard.serializer(), cardJson(id, slug, authorId))

internal fun json(body: String) = MockResponse().setBody(body).setHeader("Content-Type", "application/json")

/**
 * Answers by path (`/api/v1/…`, without the query); a route may hold its answer
 * until other requests have arrived (`after`), which is how the tests tell
 * requests sent together from requests sent one after another.
 */
internal class Routes : Dispatcher() {
    private class Route(val respond: () -> MockResponse, val after: List<String>)

    private val routes = java.util.concurrent.ConcurrentHashMap<String, Route>()
    private val arrivals = HashMap<String, CountDownLatch>()
    val requested = CopyOnWriteArrayList<String>()

    /** Answers `path`; with `after`, only once those paths have been asked for (from now on). */
    @Synchronized
    fun on(path: String, after: List<String> = emptyList(), respond: () -> MockResponse) {
        routes[path] = Route(respond, after)
        after.forEach { arrivals[it] = CountDownLatch(1) }
    }

    @Synchronized
    private fun latch(path: String) = arrivals.getOrPut(path) { CountDownLatch(1) }

    override fun dispatch(request: RecordedRequest): MockResponse {
        val path = request.requestUrl!!.encodedPath.removePrefix("/api/v1")
        requested.add(path)
        latch(path).countDown()
        val route = routes[path] ?: return MockResponse().setResponseCode(404).setBody("""{"error":{"code":"not_found","message":"$path"}}""")
        for (other in route.after) {
            // Asked one after another, the other request would never come while this one waits.
            if (!latch(other).await(3, TimeUnit.SECONDS)) {
                return MockResponse().setResponseCode(500).setBody("""{"error":{"code":"internal","message":"$other never came"}}""")
            }
        }
        return route.respond()
    }
}
