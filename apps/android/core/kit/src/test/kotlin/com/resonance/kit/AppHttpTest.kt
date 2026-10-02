package com.resonance.kit

import com.resonance.kit.api.AccountApi
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.AppHttp
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.WritingApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import java.util.concurrent.TimeUnit
import kotlin.system.measureTimeMillis
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The app's one HTTP client and how the API uses it: every request says which app it comes from,
 * and a screen that stops waiting (its coroutine cancelled — it was closed, or the account signed
 * out) stops the request it was waiting on, instead of staying stuck in it until the server
 * answers or the read times out.
 */
class AppHttpTest {
    private val server = MockWebServer()
    private val configuration get() = ApiConfiguration(server.url("/").toString()) { "token" }

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun everyRequestSaysWhichAppItComesFrom() = runBlocking {
        val agent = AppHttp.userAgent("2.0.0", 4, "15")
        assertEquals("Resonance/2.0.0 (Android 15; build 4)", agent)
        server.enqueue(MockResponse().setBody("""{"cards":[]}""").setHeader("Content-Type", "application/json"))
        ReadingApi(configuration, AppHttp.client(agent)).recommended()
        val request = server.takeRequest()
        assertEquals(agent, request.getHeader("User-Agent"))
        assertEquals("Bearer token", request.getHeader("Authorization"))
    }

    @Test fun waitsLongerThanOkHttpsTenSecondsButNotForever() {
        val client = AppHttp.client("Resonance/test")
        assertEquals(15_000, client.connectTimeoutMillis)
        assertEquals(30_000, client.readTimeoutMillis)
        assertEquals(30_000, client.writeTimeoutMillis)
    }

    /** Starts [work], waits for its request to reach the server, then cancels it: how long the cancel took. */
    private fun cancelInFlight(work: suspend () -> Unit): Long = runBlocking {
        val job: Job = launch(Dispatchers.Default) { work() }
        assertNotNull(server.takeRequest(5, TimeUnit.SECONDS), "the request never left")
        measureTimeMillis { withTimeout(5_000) { job.cancelAndJoin() } }
    }

    @Test fun cancellingTheCallerStopsAContractCall() {
        // The server never answers: only the client giving up ends the call.
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        val took = cancelInFlight { ReadingApi(configuration, AppHttp.client("Resonance/test")).me() }
        assertTrue(took < 2_000, "cancelling took ${took}ms")
    }

    @Test fun cancellingTheCallerStopsAnAccountCall() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        val took = cancelInFlight { AccountApi(configuration, AppHttp.client("Resonance/test")).export() }
        assertTrue(took < 2_000, "cancelling took ${took}ms")
    }

    @Test fun leavingTheIllustrationStopsItsStream() = runBlocking {
        // The first preview, then the stream goes quiet (rendering) for a few seconds.
        val first = "{\"type\":\"partial\",\"index\":0,\"b64\":\"iVBORw==\"}\n"
        server.enqueue(
            MockResponse().setBody(first + "{\"type\":\"done\",\"publicUrl\":\"https://img.test/x.avif\"}\n")
                .throttleBody(first.length.toLong(), 3, TimeUnit.SECONDS),
        )
        val api = WritingApi(configuration, AppHttp.client("Resonance/test"))
        val took = measureTimeMillis {
            // Taking the first preview and no more: the stream behind it ends at once.
            val event = withTimeout(5_000) { api.illustrate("s").first() }
            assertTrue(event is WritingApi.IllustrationEvent.Partial)
        }
        assertTrue(took < 2_000, "leaving took ${took}ms")
    }
}
