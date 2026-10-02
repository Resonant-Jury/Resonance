package com.resonance.app.thoughtmap

import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.app.thoughtmap.ThoughtMapService.Companion.cardSet
import com.resonance.app.thoughtmap.ThoughtMapService.Companion.readCard
import com.resonance.app.thoughtmap.ThoughtMapService.Companion.readCards
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.Instant

/**
 * The thought map reads its cards under the rules; the ones the rules keep from me — someone
 * else's anonymous card I resonated with — come from the server (GET /cards?keys=), without their
 * author, so they stay on the map. The twin of the web's useMyThoughtMap.
 */
class ThoughtMapCardsTest {
    private fun mapCard(id: String, authorId: String, publishedAt: Long? = 1L) =
        MapCard(id, authorId, slug = id, title = "Card $id", story = "# $id", tags = emptyList(), visibility = "public", publishedAt = publishedAt, mediaUrl = null, accentHue = null)

    private fun summary(id: String, author: String?) = FeedCard(
        id = id, slug = "$id-slug", title = "Card $id", excerpt = "The words of $id", tags = listOf("夜"),
        publishedAt = "2026-09-01T08:00:00.000Z",
        author = author?.let { Author(it, it, "BO", "oklch(90% 0.06 140)", null, "42", false, null) },
        anonymous = author == null, visibility = FeedCard.Visibility.`public`, imageUrl = "https://img/$id.webp", imageLabel = null,
        accentHue = 140.0, readMinutes = 1, referenceCardId = null, reason = null,
    )

    /** The rules let me read these (my own cards, public ones); the rest are refused. */
    private val readable = mapOf("mine" to mapCard("mine", "alice"), "bobs" to mapCard("bobs", "bob"))
    private val asked = mutableListOf<List<String>>()
    private val server: suspend (List<String>) -> List<FeedCard> = { ids ->
        asked += ids
        ids.filter { it == "anon" }.map { summary(it, author = null) }
    }

    @Test fun anAnonymousOriginalTheRulesRefuseComesFromTheServerWithoutItsAuthor() = runBlocking {
        val cards = readCards(listOf("anon", "bobs", "gone", "bobs"), read = { readable[it] }, summaries = server)
        assertEquals(listOf("anon", "bobs"), cards.map { it.id })
        // One request, for just what the rules didn't give.
        assertEquals(listOf(listOf("anon", "gone")), asked)
        val anon = cards.first()
        assertEquals("", anon.authorId)
        assertEquals("anon-slug", anon.slug)
        assertEquals("The words of anon", anon.story)
        assertEquals("https://img/anon.webp", anon.mediaUrl)
        assertEquals(Instant.parse("2026-09-01T08:00:00Z").toEpochMilli(), anon.publishedAt)
        assertEquals(140.0, anon.accentHue)
    }

    @Test fun everythingReadableAsksTheServerNothing() = runBlocking {
        assertEquals(listOf("mine", "bobs"), readCards(listOf("mine", "bobs"), read = { readable[it] }, summaries = server).map { it.id })
        assertEquals(emptyList<List<String>>(), asked)
    }

    @Test fun theServerFailingLeavesThoseOutThisTime() = runBlocking {
        val cards = readCards(listOf("anon", "bobs"), read = { readable[it] }, summaries = { error("offline") })
        assertEquals(listOf("bobs"), cards.map { it.id })
    }

    @Test fun theResonatedOnesAreOthersOriginalsAnonymousOnesIncluded() {
        val anon = ThoughtMapService.mapCard(summary("anon", author = null))
        val set = cardSet(
            "alice",
            originals = listOf(anon, mapCard("bobs", "bob"), mapCard("self", "alice")),
            published = listOf(mapCard("self", "alice"), mapCard("reply", "alice")),
            drafts = listOf(mapCard("draft", "alice", publishedAt = null)),
        )
        assertEquals(listOf("anon", "bobs", "self", "reply", "draft"), set.cards.keys.toList())
        assertEquals(setOf("anon", "bobs"), set.resonated)
    }

    @Test fun oneCardRefusedByTheRulesIsAskedOfTheServer() = runBlocking {
        val refused = IllegalStateException("PERMISSION_DENIED")
        val offline = IllegalStateException("UNAVAILABLE")
        val read: suspend (String) -> MapCard? = { id -> readable[id] ?: if (id == "missing") null else throw refused }
        assertEquals("", readCard("anon", read, refused = { it === refused }, summaries = server)?.authorId)
        // One I may no longer see (made private, its author blocked): gone.
        assertNull(readCard("hidden", read, refused = { it === refused }, summaries = server))
        // Not there at all: gone, without asking.
        assertNull(readCard("missing", read, refused = { it === refused }, summaries = server))
        assertEquals("bob", readCard("bobs", read, refused = { it === refused }, summaries = server)?.authorId)
        assertEquals(listOf(listOf("anon"), listOf("hidden")), asked)
        // A read that failed for now isn't "gone": the map keeps the card as it was.
        assertThrows(IllegalStateException::class.java) {
            runBlocking { readCard("x", { throw offline }, refused = { it === refused }, summaries = server) }
        }
        Unit
    }
}
