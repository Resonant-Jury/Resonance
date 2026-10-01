package com.resonance.kit

import com.resonance.api.models.CardDetail
import com.resonance.api.models.ErrorCode
import com.resonance.api.models.FeedCard
import com.resonance.api.models.Me
import com.resonance.api.models.RecommendedFeed
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

/**
 * A value the contract adds to one of its enums later (a new visibility, a third writing
 * language, a new error code) reaches installed apps before they know it: the answer it is in
 * still reads, the field becomes the generated client's "unknown" case, and only that field is
 * lost — never the whole feed, card or profile.
 */
class UnknownEnumTest {
    private val server = MockWebServer()
    private fun api() = ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" })

    @BeforeTest fun start() = server.start()
    @AfterTest fun stop() = server.shutdown()

    @Test fun aFeedWithAVisibilityFromTheFutureStillReads() = runBlocking {
        server.enqueue(json("""{"cards":[${cardJson("c1", visibility = "followers")},${cardJson("c2")}],"nextCursor":null}"""))
        val page = api().feed()
        assertEquals(listOf("c1", "c2"), page.cards.map { it.id })
        assertEquals(FeedCard.Visibility.unknownDefaultOpenApi, page.cards[0].visibility)
        assertEquals(FeedCard.Visibility.`public`, page.cards[1].visibility)
    }

    @Test fun aCardPageWithAnUnknownVisibilityStillReads() = runBlocking {
        server.enqueue(json(detailJson("c1", "a-walk").replace("\"visibility\":\"public\",\"anonymous\"", "\"visibility\":\"followers\",\"anonymous\"")))
        val detail = api().card("a-walk")
        assertEquals("c1", detail.card.id)
        assertEquals(CardDetail.Visibility.unknownDefaultOpenApi, detail.visibility)
    }

    @Test fun aProfileWritingInALanguageTheAppDoesntKnowStillReads() = runBlocking {
        server.enqueue(json("""
            {"id":"u1","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","bio":null,"avatarUrl":null,
             "region":"JP","primaryLocale":"ja","handleChangedAt":null}
        """.trimIndent()))
        val me = api().me()
        assertEquals("bob", me.handle)
        assertEquals(Me.PrimaryLocale.unknownDefaultOpenApi, me.primaryLocale)
    }

    @Test fun picksWithAStatusFromTheFutureStillRead() = runBlocking {
        server.enqueue(json("""{"cards":[${cardJson("c1")}],"status":"warming"}"""))
        assertEquals(listOf("c1"), api().recommended().map { it.id })
        // (The status itself, decoded directly.)
        val feed = com.resonance.api.infrastructure.Serializer.kotlinxSerializationJson
            .decodeFromString(RecommendedFeed.serializer(), """{"cards":[],"status":"warming"}""")
        assertEquals(RecommendedFeed.Status.unknownDefaultOpenApi, feed.status)
    }

    @Test fun anErrorCodeFromTheFutureKeepsItsMessage() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(403).setHeader("Content-Type", "application/json")
            .setBody("""{"error":{"code":"suspended","message":"This account is paused."}}"""))
        val e = assertFailsWith<ApiFailure> { api().card("a-walk") }
        assertEquals(ApiFailure("unexpected", "This account is paused.", 403), e)
        // A code it knows still comes through as itself.
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Content-Type", "application/json")
            .setBody("""{"error":{"code":"rate_limited","message":"Slow down."}}"""))
        assertEquals(ErrorCode.rateLimited.value, assertFailsWith<ApiFailure> { api().card("a-walk") }.code)
    }
}
