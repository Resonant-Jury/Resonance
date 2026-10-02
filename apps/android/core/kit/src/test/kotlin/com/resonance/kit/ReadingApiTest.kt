package com.resonance.kit

import com.resonance.api.models.FeedPage
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.NextPage
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.next
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/** The generated client through the kit's wrapper, against a local HTTP server. */
class ReadingApiTest {
    private val server = MockWebServer()
    private var refreshes = 0

    private val card = """
        {"id":"c1","slug":"a-walk","title":"一場雨後的散步","excerpt":"雨停的時候…","tags":["日常"],
         "publishedAt":"2026-09-01T08:00:00.000Z","author":{"id":"bob","handle":"bob","initials":"BO",
         "accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":true,"region":"TW"},
         "anonymous":false,"visibility":"public","imageUrl":null,"imageLabel":"一場雨後的散步","accentHue":140,
         "readMinutes":2,"referenceCardId":null,"reason":null,"someFieldFromTheFuture":1}
    """.trimIndent()

    private fun api() = ReadingApi(ApiConfiguration(server.url("/").toString()) { force ->
        if (force) { refreshes++; "fresh" } else "stale"
    })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun decodesAPageAndSendsTheToken() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"cards":[$card],"nextCursor":null}""").setHeader("Content-Type", "application/json"))
        val page = api().feed()
        assertEquals("一場雨後的散步", page.cards.first().title)
        assertEquals("42", page.cards.first().author?.avatarSeed)
        assertEquals("Bearer stale", server.takeRequest().getHeader("Authorization"))
    }

    @Test fun mapsContractErrorsToApiFailure() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":{"code":"not_found","message":"No such card."}}""").setHeader("Content-Type", "application/json"))
        val e = assertFailsWith<ApiFailure> { api().card("nope") }
        assertEquals(ApiFailure("not_found", "No such card.", 404), e)
    }

    @Test fun aProfilesNextPageIsAskedForByItsToken() = runBlocking {
        server.enqueue(json(pageJson("c1", cursor = "2026-09-01T08:00:00.000Z", token = "opaque/1")))
        server.enqueue(json(pageJson("c2")))
        val first = api().profileCards("小雨")
        assertEquals(NextPage(token = "opaque/1", cursor = null), first.next)
        val second = api().profileCards("小雨", after = first.next)
        assertNull(second.next)
        server.takeRequest()
        val url = server.takeRequest().requestUrl!!
        assertEquals("/api/v1/users/%E5%B0%8F%E9%9B%A8/cards", url.encodedPath)
        assertEquals("opaque/1", url.queryParameter("pageToken"))
        assertNull(url.queryParameter("cursor"))
    }

    @Test fun aPageWithoutATokenGoesOnByItsCursor() {
        val old = FeedPage(emptyList(), nextCursor = "2026-09-01T08:00:00.000Z")
        assertEquals(NextPage(token = null, cursor = "2026-09-01T08:00:00.000Z"), old.next)
        assertEquals(NextPage(token = "t", cursor = null), old.copy(nextPageToken = "t").next)
        assertNull(FeedPage(emptyList(), nextCursor = null, nextPageToken = null).next)
    }

    @Test fun refreshesARejectedTokenOnceAndRetries() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthenticated","message":"x"}}""").setHeader("Content-Type", "application/json"))
        server.enqueue(MockResponse().setBody("""{"cards":[]}""").setHeader("Content-Type", "application/json"))
        assertEquals(emptyList(), api().recommended())
        assertEquals(listOf("Bearer stale", "Bearer fresh"), List(2) { server.takeRequest().getHeader("Authorization") })
        assertEquals(1, refreshes)
    }
}
