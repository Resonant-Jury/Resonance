package com.resonance.kit

import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.reading.CardCache
import com.resonance.kit.reading.CardPageLoader
import com.resonance.kit.reading.cardsByKey
import com.resonance.kit.reading.embedFor
import com.resonance.kit.reading.profilePage
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The card page, the person's page and the cards shared in a conversation:
 * each is one request, and what it brings along is what the page draws.
 */
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

    @Test fun aCardPageIsOneRequestWithItsListsAndEmbeds() = runBlocking {
        routes.on("/cards/a-walk") {
            json(detailJson("c1", "a-walk", resonances = listOf("r1"), related = listOf("x1", "x2"), links = emptyList(), embeds = listOf("e1" to "the-sea")))
        }
        val page = loader.load("a-walk", preview = feedCard("c1", "a-walk"))
        assertEquals(listOf("/cards/a-walk"), routes.requested)
        assertEquals(setOf("resonances", "related", "links", "embeds"), routes.parameter("/cards/a-walk", "include")!!.split(",").toSet())
        assertEquals(listOf("r1"), page.resonances.map { it.id })
        assertEquals(listOf("x1", "x2"), page.related.map { it.id })
        assertEquals(listOf("e1"), page.embeds.map { it.id })
        assertEquals(emptyList(), page.links)
    }

    @Test fun onlyTheAuthorIsShownTheCardsLinkingToIt() = runBlocking {
        routes.on("/cards/mine") { json(detailJson("c1", "mine", owner = true, links = listOf("l1"))) }
        assertEquals(listOf("l1"), loader.load("mine").links.map { it.id })
        // Were the server ever to send them to a reader, the page still wouldn't show them.
        routes.on("/cards/theirs") { json(detailJson("c2", "theirs", links = listOf("l1"))) }
        assertEquals(emptyList(), loader.load("theirs").links)
    }

    @Test fun aServerThatLeavesTheListsOutGivesAnEmptyPageNotAFailure() = runBlocking {
        routes.on("/cards/a-walk") { json(detailJson("c1", "a-walk")) }
        val page = loader.load("a-walk")
        assertEquals("c1", page.detail.card.id)
        assertEquals(emptyList(), page.resonances + page.related + page.links + page.embeds)
    }

    @Test fun aSecondVisitDrawsFromTheCache() = runBlocking {
        routes.on("/cards/a-walk") { json(detailJson("c1", "a-walk", resonances = listOf("r1"), embeds = listOf("e1" to "the-sea"))) }
        assertNull(cache.page("a-walk"))
        loader.load("a-walk")
        // Under the slug it was opened by and under its id, with what the story embeds.
        assertEquals("c1", cache.page("a-walk")?.detail?.card?.id)
        assertEquals(listOf("r1"), cache.page("c1")?.resonances?.map { it.id })
        assertEquals(listOf("e1"), cache.page("a-walk")?.embeds?.map { it.id })
    }

    @Test fun aCardThatIsGoneIsNotFoundAndNotCached() = runBlocking {
        val e = assertFailsWith<ApiFailure> { loader.load("a-walk", preview = feedCard("c1", "a-walk")) }
        assertTrue(e.isNotFound)
        assertNull(cache.page("a-walk"))
        // The list's own card is still there to draw from while the page asks again.
        assertNotNull(cache.preview("a-walk"))
        cache.forget("a-walk")
        assertNull(cache.preview("c1"))
    }

    @Test fun aStorysCardLinksDrawTheCardsThePageBroughtByTheirSlugOrId() = runBlocking {
        val story = listOf(
            "[The sea](/card/the-sea)",
            "[An old one](/card/e2)",
            "[Hidden](/card/hidden)",
            "> [Quoted](/card/the-sea?from=quote)",
            "[Encoded](/card/old%2Dslug)",
        ).joinToString("\n\n")
        routes.on("/cards/a-walk") {
            // Each once, only those this reader may see: the hidden one isn't there.
            json(detailJson("c1", "a-walk", story = story, embeds = listOf("e1" to "the-sea", "e2" to "old-slug")))
        }
        val page = loader.load("a-walk")
        val links = StoryParser.parse(page.detail.story).flatMap { b -> if (b is StoryBlock.Quote) b.children else listOf(b) }
            .filterIsInstance<StoryBlock.CardEmbed>().map { it.href }
        assertEquals(
            listOf("e1", "e2", null, "e1", "e2"),
            links.map { page.embeds.embedFor(it)?.id },
        )
        // A link that isn't a card's is never an embed.
        assertNull(page.embeds.embedFor("/u/the-sea"))
        assertNull(page.embeds.embedFor("/card/"))
    }

    @Test fun thePersonsPageIsOneRequest() = runBlocking {
        routes.on("/users/bob") {
            json(
                """{"author":${authorJson("bob")},"bio":null,
                    "joinedAt":"2026-01-01T00:00:00.000Z","cardCount":1,"isSelf":false,"isConnected":true,"isBlocked":false,
                    "cards":${pageJson("c1", cursor = "2026-09-01T08:00:00.000Z")},"links":${listJson("l1")}}""",
            )
        }
        val page = api.profilePage("bob")
        assertEquals(listOf("/users/bob"), routes.requested)
        assertEquals(setOf("cards", "links"), routes.parameter("/users/bob", "include")!!.split(",").toSet())
        assertEquals("12", routes.parameter("/users/bob", "limit"))
        assertEquals("bob", page.profile.author.handle)
        assertEquals(listOf("c1"), page.cards.cards.map { it.id })
        assertEquals("2026-09-01T08:00:00.000Z", page.cards.nextCursor)
        assertEquals(listOf("l1"), page.links.map { it.id })
    }

    @Test fun aProfileAloneAsksForNoLists() = runBlocking {
        routes.on("/users/bob") {
            json("""{"author":${authorJson("bob")},"bio":null,"joinedAt":"2026-01-01T00:00:00.000Z","cardCount":0,"isSelf":false,"isConnected":false,"isBlocked":false}""")
        }
        assertEquals("bob", api.profile("bob").author.handle)
        assertNull(routes.parameter("/users/bob", "include"))
        assertNull(routes.parameter("/users/bob", "limit"))
        // The page of a person the server answered without lists shows them with none.
        val page = api.profilePage("bob")
        assertEquals(emptyList(), page.cards.cards + page.links)
        assertNull(page.cards.nextCursor)
    }

    @Test fun sharedCardsAreReadInOneRequestAndTheOnesNotShownAreNull() = runBlocking {
        // The server answers in the order asked, leaving out what the reader can't see.
        routes.on("/cards") { json(listJson("c2", "c1")) }
        val cards = api.cardsByKey(listOf("c2", "gone", "c1"))
        assertEquals(listOf("/cards"), routes.requested)
        assertEquals("c2,gone,c1", routes.parameter("/cards", "keys"))
        assertEquals(listOf("c2", "gone", "c1"), cards.keys.toList())
        assertEquals("c1", cards["c1"]?.id)
        assertNull(cards["gone"])
        assertTrue("gone" in cards)
    }

    @Test fun aCardLinkedToBySlugIsFoundByItsSlug() = runBlocking {
        // A link names its card by slug; the answer names cards by id (and carries their slugs).
        routes.on("/cards") { json("""{"cards":[${cardJson("c1", "rich-story")},${cardJson("c2")}]}""") }
        val cards = api.cardsByKey(listOf("rich-story", "c2", "no-such-slug"))
        assertEquals("rich-story,c2,no-such-slug", routes.parameter("/cards", "keys"))
        assertEquals("c1", cards["rich-story"]?.id)
        assertEquals("c2", cards["c2"]?.id)
        assertNull(cards["no-such-slug"])
        assertEquals(listOf("rich-story", "c2", "no-such-slug"), cards.keys.toList())
    }

    @Test fun moreThanThirtyCardsGoOutInRequestsOfThirtyAndNoneGoOutForNone() = runBlocking {
        routes.on("/cards") { json(listJson()) }
        assertEquals(emptyMap(), api.cardsByKey(emptyList()))
        assertEquals(emptyList(), routes.requested)
        val ids = (1..35).map { "c$it" }
        assertEquals(ids, api.cardsByKey(ids + "c1").keys.toList())
        assertEquals(listOf(30, 5), routes.queries.map { q -> q.substringAfter("keys=").split("%2C", ",").size }.sortedDescending())
    }

    @Test fun aKeyNoCardCouldHaveIsNeverAskedForAndIsNoCard() = runBlocking {
        routes.on("/cards") { json(listJson("c1")) }
        val cards = api.cardsByKey(listOf("c1", "故事", "a.html", "a".repeat(161)))
        // One request, without them: the server would refuse it whole for any one of them.
        assertEquals("c1", routes.parameter("/cards", "keys"))
        assertEquals("c1", cards["c1"]?.id)
        assertEquals(listOf("c1", "故事", "a.html", "a".repeat(161)), cards.keys.toList())
        assertNull(cards["故事"])
        // Nothing to ask for, nothing asked.
        assertEquals(mapOf<String, Any?>("雨" to null), api.cardsByKey(listOf("雨")))
        assertEquals(1, routes.requested.size)
    }

    @Test fun aRequestThatFailsLosesOnlyItsOwnCards() = runBlocking {
        // 35 cards are two requests; the one with c31 in it fails, the other answers.
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): okhttp3.mockwebserver.MockResponse {
                val keys = request.requestUrl!!.queryParameter("keys")!!.split(",")
                return if ("c31" in keys) okhttp3.mockwebserver.MockResponse().setResponseCode(503)
                else json(listJson(*keys.toTypedArray()))
            }
        }
        val ids = (1..35).map { "c$it" }
        val cards = api.cardsByKey(ids)
        // The cards of the request that answered; the others are left out, to be asked for again.
        assertEquals((1..30).map { "c$it" }, cards.keys.toList())
        assertEquals("c30", cards["c30"]?.id)
        assertTrue("c31" !in cards && "c35" !in cards)
        // Every request failing is a failure.
        assertFailsWith<ApiFailure> { api.cardsByKey(listOf("c31", "c32")) }
    }

    @Test fun theCacheIsForgottenWhole() {
        cache.rememberPreview(feedCard("c1", "a-walk"))
        assertEquals("c1", cache.idFor("a-walk"))
        cache.clear()
        assertNull(cache.idFor("a-walk"))
        assertNull(cache.preview("c1"))
    }
}
