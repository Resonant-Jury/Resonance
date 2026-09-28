package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

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

    @Test fun refreshesARejectedTokenOnceAndRetries() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"unauthenticated","message":"x"}}""").setHeader("Content-Type", "application/json"))
        server.enqueue(MockResponse().setBody("""{"cards":[]}""").setHeader("Content-Type", "application/json"))
        assertEquals(emptyList(), api().recommended())
        assertEquals(listOf("Bearer stale", "Bearer fresh"), List(2) { server.takeRequest().getHeader("Authorization") })
        assertEquals(1, refreshes)
    }
}
