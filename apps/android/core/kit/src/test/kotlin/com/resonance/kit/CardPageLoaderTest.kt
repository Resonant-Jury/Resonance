package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.reading.CardCache
import com.resonance.kit.reading.CardPageLoader
import com.resonance.kit.reading.profilePage
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The card page and the person's page: their requests go out together, and the lists use the card's id. */
class CardPageLoaderTest {
    private val server = MockWebServer()
    private val routes = Routes()
    private val cache = CardCache()
    private val api by lazy { ReadingApi(ApiConfiguration(server.url("/").toString()) { "token" }) }
    private val loader by lazy { CardPageLoader(api, cache) }

    @BeforeTest fun start() {
        server.dispatcher = routes
        server.start()
    }

    @AfterTest fun stop() = server.shutdown()

    private fun serveListsOfC1() {
        routes.on("/cards/c1/resonances") { json(listJson("r1")) }
        routes.on("/cards/c1/related") { json(listJson("x1", "x2")) }
        // The server looks resonances up by the raw key: a slug finds none.
        routes.on("/cards/a-walk/resonances") { json(listJson()) }
        routes.on("/cards/a-walk/related") { json(listJson()) }
    }

    @Test fun openedFromAListTheListsLeaveBesideTheCard() = runBlocking {
        serveListsOfC1()
        // The card answers only once both lists have been asked for.
        routes.on("/cards/a-walk", after = listOf("/cards/c1/resonances", "/cards/c1/related")) { json(detailJson("c1", "a-walk")) }
        var shown: String? = null
        val page = loader.load("a-walk", preview = feedCard("c1", "a-walk"), viewer = "me") { shown = it.card.id }
        assertEquals("c1", shown)
        assertEquals(listOf("r1"), page.resonances.map { it.id })
        assertEquals(listOf("x1", "x2"), page.related.map { it.id })
        // Not the reader's card: nobody asks for the links to it.
        assertFalse(routes.requested.any { it.endsWith("/links") })
    }

    @Test fun aSlugWithNothingKnownReadsTheListsByTheCardsId() = runBlocking {
        serveListsOfC1()
        routes.on("/cards/a-walk") { json(detailJson("c1", "a-walk")) }
        val page = loader.load("a-walk")
        assertEquals(listOf("r1"), page.resonances.map { it.id })
        assertFalse("/cards/a-walk/resonances" in routes.requested)
    }

    @Test fun aSecondVisitDrawsFromTheCacheAndGoesOutTogether() = runBlocking {
        serveListsOfC1()
        routes.on("/cards/a-walk") { json(detailJson("c1", "a-walk")) }
        assertNull(cache.page("a-walk"))
        loader.load("a-walk")
        assertEquals("c1", cache.page("a-walk")?.detail?.card?.id)
        assertEquals(listOf("r1"), cache.page("c1")?.resonances?.map { it.id })
        // Opened again by its slug (a link, the back button): the id is known, so nothing waits on the card.
        routes.on("/cards/a-walk", after = listOf("/cards/c1/resonances", "/cards/c1/related")) { json(detailJson("c1", "a-walk")) }
        assertEquals(listOf("x1", "x2"), loader.load("a-walk").related.map { it.id })
    }

    @Test fun theAuthorAlsoGetsTheCardsLinkingToIt() = runBlocking {
        serveListsOfC1()
        routes.on("/cards/c1/links") { json(listJson("l1")) }
        routes.on("/cards/a-walk", after = listOf("/cards/c1/links")) { json(detailJson("c1", "a-walk", owner = true)) }
        val page = loader.load("a-walk", preview = feedCard("c1", "a-walk", authorId = "me"), viewer = "me")
        assertEquals(listOf("l1"), page.links.map { it.id })
    }

    @Test fun aCardThatIsGoneIsNotFoundAndNotCached() = runBlocking {
        serveListsOfC1()
        val e = assertFailsWith<ApiFailure> { loader.load("a-walk", preview = feedCard("c1", "a-walk")) }
        assertTrue(e.isNotFound)
        assertNull(cache.page("a-walk"))
        // The list's own card is still there to draw from while the page asks again.
        assertNotNull(cache.preview("a-walk"))
        cache.forget("a-walk")
        assertNull(cache.preview("c1"))
    }

    @Test fun thePersonsPageAsksForAllThreeTogether() = runBlocking {
        routes.on("/users/bob/cards") { json(pageJson("c1", cursor = "2026-09-01T08:00:00.000Z")) }
        routes.on("/users/bob/links") { MockResponse().setResponseCode(500) }
        routes.on("/users/bob", after = listOf("/users/bob/cards", "/users/bob/links")) {
            json(
                """{"author":${authorJson("bob")},"bio":null,
                    "joinedAt":"2026-01-01T00:00:00.000Z","cardCount":1,"isSelf":false,"isConnected":true,"isBlocked":false}""",
            )
        }
        val page = api.profilePage("bob")
        assertEquals("bob", page.profile.author.handle)
        assertEquals(listOf("c1"), page.cards.cards.map { it.id })
        // The links are a nicety: the page shows without them.
        assertEquals(emptyList(), page.links)
    }

    @Test fun theCacheIsForgottenWhole() {
        cache.rememberPreview(feedCard("c1", "a-walk"))
        assertEquals("c1", cache.idFor("a-walk"))
        cache.clear()
        assertNull(cache.idFor("a-walk"))
        assertNull(cache.preview("c1"))
    }
}
