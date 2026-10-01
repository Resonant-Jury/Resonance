package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.api.PushApi
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The API's HTTP cache: a read the server lets a private cache keep is answered from it, until
 * the viewer changes something — then each address is read from the server once more — and
 * nothing of it outlives the account (sign-out empties it).
 */
class HttpCachingTest {
    private val server = MockWebServer()
    private val routes = Routes()
    /** What reached the server: "GET /feed no-cache" or "GET /feed". */
    private val reached = CopyOnWriteArrayList<String>()
    /** The X-Resonance-Cache header of each request (the server's max-age is opt-in). */
    private val optedIn = CopyOnWriteArrayList<String?>()
    private val dir = Files.createTempDirectory("http-cache").toFile()
    private val cache = Cache(dir, 1L shl 20)
    private val caching = HttpCaching(cache)
    private val http by lazy { caching.client(OkHttpClient()) }
    private val config by lazy { ApiConfiguration(server.url("/").toString()) { "token" } }
    private val reading by lazy { ReadingApi(config, http) }
    private val writing by lazy { WritingApi(config, http) }
    private val push by lazy { PushApi(config, http) }

    /** What the server will send, from API-7: private (it depends on the viewer), briefly fresh, with a validator. */
    private fun cacheable(body: String) = json(body).setHeader("Cache-Control", "private, max-age=60").setHeader("ETag", "\"v1\"")

    @BeforeTest fun start() {
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath.removePrefix("/api/v1")
                reached.add("${request.method} $path" + if (request.getHeader("Cache-Control") == "no-cache") " no-cache" else "")
                optedIn.add(request.getHeader("X-Resonance-Cache"))
                return routes.dispatch(request)
            }
        }
        routes.on("/feed") { cacheable(pageJson("a")) }
        routes.on("/cards/c1/publish") { json("""{"id":"c1","slug":"a-walk","firstPublish":true}""") }
        routes.on("/me/devices/install-1") { MockResponse().setResponseCode(204) }
        server.start()
    }

    @AfterTest fun stop() {
        server.shutdown()
        dir.deleteRecursively()
    }

    @Test fun everyReadOptsInToTheServersReuse() = runBlocking {
        reading.feed()
        assertEquals(listOf<String?>("1"), optedIn)
    }

    @Test fun aFreshAnswerComesFromTheCache() = runBlocking {
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed"), reached)
    }

    @Test fun afterTheViewersOwnWriteEachAddressIsReadFromTheServerOnce() = runBlocking {
        reading.feed()
        writing.publish("c1")
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed", "POST /cards/c1/publish", "GET /feed no-cache"), reached)
    }

    @Test fun aPushRegistrationChangesNothingTheApiReads() = runBlocking {
        reading.feed()
        push.register("install-1", "fcm-token", Strings.Language.En, "2.0.0")
        reading.feed()
        assertEquals(listOf("GET /feed", "PUT /me/devices/install-1"), reached)
    }

    @Test fun aChangeMadeOutsideTheApiAlsoReadsAfresh() = runBlocking {
        // A bookmark or a block is written to Firestore: the app says so.
        reading.feed()
        caching.invalidate()
        reading.feed()
        reading.feed()
        assertEquals(listOf("GET /feed", "GET /feed no-cache"), reached)
    }

    @Test fun anAnswerStillOnItsWayWhenTheAccountLeavesIsNeverKept() = runBlocking {
        val gate = CountDownLatch(1)
        val asked = CountDownLatch(1)
        routes.on("/feed") {
            asked.countDown()
            gate.await(5, TimeUnit.SECONDS)
            cacheable(pageJson("theirs"))
        }
        val pending = async(Dispatchers.IO) { runCatching { reading.feed() } }
        assertTrue(asked.await(5, TimeUnit.SECONDS))
        // Signed out (or someone else signed in) while the feed was still coming.
        caching.cancelCalls()
        assertTrue(pending.await().isFailure)
        gate.countDown()
        caching.evict()
        assertEquals(0L, cache.size())
    }

    @Test fun signingOutLeavesNothingBehind() = runBlocking {
        reading.feed()
        caching.clear()
        assertEquals(0L, cache.size())
        reading.feed()
        assertEquals(listOf("GET /feed", "GET /feed no-cache"), reached)
    }
}
