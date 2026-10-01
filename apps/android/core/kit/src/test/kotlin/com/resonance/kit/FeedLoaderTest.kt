package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.reading.FeedLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds

/**
 * The home feed never waits on today's picks: the latest cards show when they
 * arrive, and picks that come later wait behind the hint instead of moving
 * what is on screen.
 */
class FeedLoaderTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val picksGate = CountDownLatch(1)
    private val latestGate = CountDownLatch(1)
    private val loader by lazy {
        FeedLoader(ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" }), scope, retryPicksAfter = 50.milliseconds)
    }

    @BeforeTest fun start() {
        server.dispatcher = routes
        server.start()
    }

    @AfterTest fun stop() {
        picksGate.countDown()
        latestGate.countDown()
        scope.cancel()
        server.shutdown()
    }

    private fun held(gate: CountDownLatch, body: String): MockResponse {
        gate.await(5, TimeUnit.SECONDS)
        return json(body)
    }

    private suspend fun until(check: (FeedLoader.State) -> Boolean) = withTimeout(4_000) { loader.state.first(check) }

    @Test fun theLatestShowsWhileThePicksAreStillComingAndThePicksWaitForATap() = runBlocking {
        routes.on("/feed") { json(pageJson("a", "b", "p2", cursor = "2026-09-01T08:00:00.000Z")) }
        routes.on("/feed/recommended") { held(picksGate, listJson("p1", "p2")) }
        loader.load()
        val shown = until { it.phase == FeedLoader.Phase.Loaded }
        assertEquals(listOf("a", "b", "p2"), shown.cards.map { it.id })
        assertFalse(shown.picksReady)

        picksGate.countDown()
        val ready = until { it.picksReady }
        // Nothing moved: the picks wait behind the hint.
        assertEquals(listOf("a", "b", "p2"), ready.cards.map { it.id })

        loader.revealPicks()
        val revealed = loader.state.value
        assertEquals(listOf("p1", "p2", "a", "b"), revealed.cards.map { it.id })
        assertFalse(revealed.picksReady)
        assertTrue(revealed.canLoadMore)
    }

    @Test fun picksAMomentBehindTheLatestStillLead() = runBlocking {
        routes.on("/feed") { json(pageJson("a", "b")) }
        routes.on("/feed/recommended") {
            Thread.sleep(150)
            json(listJson("p1"))
        }
        loader.load()
        val shown = until { it.phase == FeedLoader.Phase.Loaded }
        assertEquals(listOf("p1"), shown.cards.map { it.id })
        assertFalse(shown.picksReady)
    }

    @Test fun picksThatComeFirstLeadAndTheLatestWaitsBehindLoadMore() = runBlocking {
        routes.on("/feed") { held(latestGate, pageJson("a", "p1")) }
        routes.on("/feed/recommended") { json(listJson("p1", "p2")) }
        loader.load()
        val shown = until { it.phase == FeedLoader.Phase.Loaded }
        assertEquals(listOf("p1", "p2"), shown.cards.map { it.id })

        latestGate.countDown()
        val both = until { it.latest.isNotEmpty() }
        assertEquals(listOf("p1", "p2"), both.cards.map { it.id })
        assertTrue(both.canLoadMore)
        loader.loadMore()
        assertEquals(listOf("p1", "p2", "a"), loader.state.value.cards.map { it.id })
        assertFalse(loader.state.value.canLoadMore)
    }

    @Test fun aFailedPickRequestIsAskedAgainAndThenOffered() = runBlocking {
        val asked = AtomicInteger()
        routes.on("/feed") { json(pageJson("a")) }
        routes.on("/feed/recommended") {
            if (asked.incrementAndGet() == 1) MockResponse().setResponseCode(504) else json(listJson("p1"))
        }
        loader.load()
        until { it.phase == FeedLoader.Phase.Loaded }
        val ready = until { it.picksReady }
        assertEquals(2, asked.get())
        assertEquals(listOf("a"), ready.cards.map { it.id })
    }

    @Test fun theNextPageAppendsWithoutRepeats() = runBlocking {
        routes.on("/feed") { json(pageJson("a", "b", cursor = "2026-09-01T08:00:00.000Z")) }
        routes.on("/feed/recommended") { json(listJson()) }
        loader.load()
        until { it.phase == FeedLoader.Phase.Loaded && it.cursor != null }
        routes.on("/feed") { json(pageJson("b", "c")) }
        loader.loadMore()
        val more = until { it.cards.size == 3 }
        assertEquals(listOf("a", "b", "c"), more.cards.map { it.id })
        assertFalse(more.canLoadMore)
    }

    @Test fun comingBackFindsTheFeedAsItWasUnlessItIsStale() = runBlocking {
        val reads = AtomicInteger()
        routes.on("/feed") { reads.incrementAndGet(); json(pageJson("a")) }
        routes.on("/feed/recommended") { json(listJson()) }
        loader.refresh("me", version = 0, now = 0)
        until { it.phase == FeedLoader.Phase.Loaded }
        // The screen came back: nothing is read again.
        loader.refresh("me", version = 0, now = 1_000)
        assertEquals(1, reads.get())
        // The reader published a card: read again, keeping what's shown meanwhile.
        routes.on("/feed") { reads.incrementAndGet(); held(latestGate, pageJson("mine", "a")) }
        loader.refresh("me", version = 1, now = 2_000)
        assertEquals(FeedLoader.Phase.Loaded, loader.state.value.phase)
        assertEquals(listOf("a"), loader.state.value.cards.map { it.id })
        latestGate.countDown()
        until { it.cards.size == 2 }
        // Someone else signed in: their feed starts from the skeleton.
        routes.on("/feed") { json(pageJson("theirs")) }
        loader.refresh("them", version = 1, now = 3_000)
        assertEquals(listOf("theirs"), until { it.phase == FeedLoader.Phase.Loaded }.cards.map { it.id })
    }

    @Test fun theAppBackAfterAQuarterOfAnHourReadsAgainInTheBackground() = runBlocking {
        val reads = AtomicInteger()
        routes.on("/feed") { reads.incrementAndGet(); json(pageJson("a")) }
        routes.on("/feed/recommended") { json(listJson()) }
        val minute = 60_000L
        loader.refresh("me", version = 0, now = 0)
        until { it.phase == FeedLoader.Phase.Loaded }
        loader.refresh("me", version = 0, now = 14 * minute)
        assertEquals(1, reads.get())
        loader.refresh("me", version = 0, now = 16 * minute)
        // What is on screen stays while it goes.
        assertEquals(listOf("a"), loader.state.value.cards.map { it.id })
        withTimeout(4_000) { while (reads.get() < 2) kotlinx.coroutines.delay(10) }
    }

    @Test fun nothingAnsweringIsAFailureAndATryAgainLoads() = runBlocking {
        routes.on("/feed") { MockResponse().setResponseCode(500) }
        routes.on("/feed/recommended") { MockResponse().setResponseCode(500) }
        loader.load()
        until { it.phase == FeedLoader.Phase.Failed }
        routes.on("/feed") { json(pageJson("a")) }
        loader.load()
        assertEquals(listOf("a"), until { it.phase == FeedLoader.Phase.Loaded }.cards.map { it.id })
    }
}
