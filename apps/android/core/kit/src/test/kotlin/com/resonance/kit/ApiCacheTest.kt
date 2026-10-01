package com.resonance.kit

import com.resonance.api.models.FeedPage
import com.resonance.api.models.Me
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.reading.ApiCache
import com.resonance.kit.reading.FeedLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockWebServer
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * What a cold start draws before the server answers: the feed, today's picks, the profile and the
 * published shelf as they were last read — each account's own, never yesterday's picks, never a
 * card by someone blocked since — and nothing once the account signs out.
 */
class ApiCacheTest {
    private val dir = Files.createTempDirectory("api-cache").toFile()
    /** The device's clock (UTC); a test moves it on. */
    private var now = Instant.parse("2026-10-02T23:30:00Z")
    private val clock = object : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?) = this
        override fun instant(): Instant = now
    }

    /** A launch of the app: a cache over what the last one left on the device. */
    private fun launch() = ApiCache(dir, clock)

    private val me = Me(
        id = "alice", handle = "alice", initials = "AL", accentColor = "oklch(88% 0.08 55)",
        bio = "Walks.", avatarUrl = null, region = "TW", primaryLocale = Me.PrimaryLocale.zhTW, handleChangedAt = null,
    )

    @AfterTest fun clean() {
        dir.deleteRecursively()
    }

    @Test fun theNextLaunchFindsWhatThisOneRead() = runBlocking {
        launch().of("alice").run {
            saveLatest(FeedPage(listOf(feedCard("a"), feedCard("b")), nextCursor = "2026-09-01T08:00:00.000Z"))
            savePicks(listOf(feedCard("p1")))
            saveMe(me)
            savePublished(listOf(feedCard("mine", authorId = "alice")))
        }
        val next = launch().of("alice")
        assertEquals(listOf("a", "b"), next.latest()?.cards?.map { it.id })
        assertEquals("2026-09-01T08:00:00.000Z", next.latest()?.nextCursor)
        assertEquals(listOf("p1"), next.picks()?.map { it.id })
        assertEquals(me, next.me())
        assertEquals(listOf("mine"), next.published()?.map { it.id })
    }

    @Test fun yesterdaysPicksAreNotTodays() = runBlocking {
        launch().of("alice").run {
            savePicks(listOf(feedCard("p1")))
            saveLatest(FeedPage(listOf(feedCard("a")), null))
        }
        // Past midnight UTC: the server builds new picks; the latest cards still draw.
        now = Instant.parse("2026-10-03T00:10:00Z")
        val next = launch().of("alice")
        assertNull(next.picks())
        assertEquals(listOf("a"), next.latest()?.cards?.map { it.id })
    }

    @Test fun someoneBlockedSinceIsLeftOut() = runBlocking {
        val alice = launch().of("alice")
        alice.saveLatest(FeedPage(listOf(feedCard("a", authorId = "bob"), feedCard("b", authorId = "carol")), null))
        alice.savePicks(listOf(feedCard("p1", authorId = "bob"), feedCard("p2", authorId = "dora")))
        alice.saveBlocked(setOf("bob"))
        val next = launch().of("alice")
        assertEquals(listOf("b"), next.latest()?.cards?.map { it.id })
        assertEquals(listOf("p2"), next.picks()?.map { it.id })
    }

    @Test fun eachAccountHasItsOwnAndSigningOutForgetsIt() = runBlocking {
        val cache = launch()
        cache.of("alice").saveMe(me)
        cache.of("bob").saveLatest(FeedPage(listOf(feedCard("b1")), null))
        assertNull(cache.of("bob").me())

        cache.clear("alice")
        assertNull(cache.of("alice").me())
        assertNull(launch().of("alice").me())
        assertEquals(listOf("b1"), launch().of("bob").latest()?.cards?.map { it.id })
    }

    @Test fun aColdStartShowsTheKeptFeedAtOnceThenTheServersAndKeepsThat() = runBlocking {
        launch().of("alice").run {
            saveLatest(FeedPage(listOf(feedCard("old")), null))
            savePicks(emptyList())
        }
        val server = MockWebServer()
        val routes = Routes()
        val gate = CountDownLatch(1)
        routes.on("/feed") { gate.await(5, TimeUnit.SECONDS); json(pageJson("new", "old")) }
        routes.on("/feed/recommended") { gate.await(5, TimeUnit.SECONDS); json(listJson()) }
        server.dispatcher = routes
        server.start()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            val cache = launch()
            val loader = FeedLoader(ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" }), scope, storeFor = { cache.of(it) })
            loader.refresh("alice", version = 0)
            // Before the server answers: the feed as it was, not the skeleton.
            val kept = withTimeout(4_000) { loader.state.first { it.phase == FeedLoader.Phase.Loaded } }
            assertEquals(listOf("old"), kept.cards.map { it.id })
            gate.countDown()
            val read = withTimeout(4_000) { loader.state.first { it.cards.size == 2 } }
            assertEquals(listOf("new", "old"), read.cards.map { it.id })
            // What the server said is what the next launch starts from.
            withTimeout(4_000) {
                while (launch().of("alice").latest()?.cards?.size != 2) delay(20)
            }
        } finally {
            scope.cancel()
            server.shutdown()
        }
    }
}
