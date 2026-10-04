package com.resonance.kit.chat

import com.resonance.kit.api.MessagingApi
import com.resonance.kit.feedCard
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Which messages share a card of the site — by `cardRef` or by a link to its page — what their
 * bubbles carry, and whether their words still show.
 */
class SharedCardsTest {
    private fun message(text: String, cardRef: String? = null, preview: String? = null) = ChatMessage(
        id = "m1", senderId = "bob", text = text, sentAt = Date(0), cardRef = cardRef,
        preview = preview?.let { LinkPreview(it, "A title", null, null, null) },
    )

    @Test fun aCardPageOfTheSiteIsACard() {
        assertEquals("rich-story", SharedCards.keyOf("https://resonance.channel/card/rich-story"))
        assertEquals("rich-story", SharedCards.keyOf("https://resonance.channel/zh-TW/card/rich-story"))
        assertEquals("rich-story", SharedCards.keyOf("https://resonance.channel/en/card/rich-story/"))
        assertEquals("rich-story", SharedCards.keyOf("http://WWW.Resonance.Channel/zh-tw/card/rich-story?from=share#top"))
        assertEquals("rich-story", SharedCards.keyOf("www.resonance.channel/card/rich-story"))
        // The address the site had before still serves it.
        assertEquals("a-walk", SharedCards.keyOf("https://resonance-world.vercel.app/en/card/a-walk"))
        // An id works as well as a slug; an escaped key is read decoded.
        assertEquals("eBkq0mYc2pQXn8vL1sD3", SharedCards.keyOf("https://resonance.channel/card/eBkq0mYc2pQXn8vL1sD3"))
        assertEquals("a_b-c", SharedCards.keyOf("https://resonance.channel/card/a%5Fb-c"))
    }

    @Test fun aKeyNoCardCouldHaveIsNoCard() {
        // The contract's CardKey is letters, digits, `_` and `-`, up to 160: asked for, anything else
        // would fail the request for every other card shared beside it.
        listOf(
            // A link read on into the words written after it (the path may hold CJK letters).
            "https://resonance.channel/card/rich-story了嗎",
            "https://resonance.channel/card/%E4%B8%80%E5%BC%B5%E5%8D%A1",
            "https://resonance.channel/card/hello.world", "https://resonance.channel/card/a,b", "https://resonance.channel/card/a~b",
            "https://resonance.channel/card/..", "https://resonance.channel/card/a%20b",
            "https://resonance.channel/card/" + "a".repeat(161),
        ).forEach { assertNull(SharedCards.keyOf(it), it) }
        assertEquals("a".repeat(160), SharedCards.keyOf("https://resonance.channel/card/" + "a".repeat(160)))
        // Such a link is a link again, with its preview if the server made one.
        val text = "看這張 https://resonance.channel/card/rich-story了嗎"
        assertNull(SharedCards.of(message(text)))
        assertEquals(Carried.Words, Carried.of(message(text), null, emptyMap(), emptySet()))
    }

    @Test fun anythingElseIsNoCard() {
        listOf(
            // Other pages of the site, and paths that only look like a card's.
            "https://resonance.channel/", "https://resonance.channel/zh-TW/u/bob", "https://resonance.channel/card/",
            "https://resonance.channel/card/a/edit", "https://resonance.channel/fr/card/a", "https://resonance.channel/zh-TW/en/card/a",
            "https://resonance.channel/write/card/a", "https://resonance.channel/card/%2F",
            // Look-alikes, userinfo, a port, another scheme, another host.
            "https://resonance.channel.example.com/card/a", "https://resonance.channel@example.com/card/a", "https://notresonance.channel/card/a",
            "https://resonance.channel:8443/card/a", "ftp://resonance.channel/card/a", "https://img.resonance.channel/card/a",
            "https://example.com/card/a", "not a link",
        ).forEach { assertNull(SharedCards.keyOf(it), it) }
    }

    @Test fun aLocalStackSharesItsOwnCardsOnlyWhenTheBuildTalksToIt() {
        val local = "http://10.0.2.2:3300/zh-TW/card/rich-story"
        assertNull(SharedCards.keyOf(local))
        assertEquals("rich-story", SharedCards.keyOf(local, ownHost = "10.0.2.2:3300"))
        assertNull(SharedCards.keyOf("http://10.0.2.2:3100/card/rich-story", ownHost = "10.0.2.2:3300"))
        // Production's hosts count in such a build too.
        assertEquals("rich-story", SharedCards.keyOf("https://resonance.channel/card/rich-story", ownHost = "10.0.2.2:3300"))
    }

    @Test fun aCarriedCardComesFirstThenTheFirstLinkThenThePreviewsPage() {
        assertEquals(SharedCard("c1", attached = true), SharedCards.of(message("look https://resonance.channel/card/other", cardRef = "c1")))
        val text = "看這張 https://resonance.channel/zh-TW/card/rich-story ！"
        val shared = SharedCards.of(message(text))!!
        assertEquals("rich-story", shared.key)
        assertFalse(shared.attached)
        assertEquals("https://resonance.channel/zh-TW/card/rich-story", text.substring(shared.link!!.range.first, shared.link!!.range.last + 1))
        // Only the first link is the message's card (the one the server previews).
        assertNull(SharedCards.of(message("https://example.com and https://resonance.channel/card/a")))
        assertEquals("a", SharedCards.of(message("(see)", preview = "https://resonance.channel/card/a"))?.key)
        assertNull(SharedCards.of(message("https://example.com", preview = "https://example.com/")))
        assertNull(SharedCards.of(message("")))
    }

    @Test fun aLinkAloneLeavesNoWordsAWrittenMessageKeepsThem() {
        fun words(text: String, cardRef: String? = null) = SharedCards.hasWords(text, SharedCards.of(message(text, cardRef))!!)
        assertFalse(words("https://resonance.channel/zh-TW/card/rich-story"))
        assertFalse(words("  https://resonance.channel/card/a \n"))
        assertTrue(words("this one https://resonance.channel/card/a"))
        assertTrue(words("https://resonance.channel/card/a 你看"))
        // A card carried with words keeps them; carried alone, there are none.
        assertTrue(words("我昨天寫的", cardRef = "c1"))
        assertFalse(words("", cardRef = "c1"))
    }

    private fun carried(m: ChatMessage, cards: Map<String, com.resonance.api.models.FeedCard?> = emptyMap(), loading: Set<String> = emptySet()) =
        Carried.of(m, SharedCards.of(m), cards, loading)

    @Test fun aSharedCardIsDrawnOnceReadAndItsStandInWhileItIsRead() {
        val linked = message("https://resonance.channel/zh-TW/card/rich-story")
        val card = feedCard("c1", "rich-story")
        val shown = carried(linked, cards = mapOf("rich-story" to card))
        assertEquals(card, (shown as Carried.Card).card)
        // The link alone stands for the card: no words.
        assertEquals("", shown.words(linked))
        val loading = carried(linked, loading = setOf("rich-story"))
        assertTrue(loading is Carried.CardLoading)
        assertEquals("", loading.words(linked))
        // With words besides the link, all of them show, the link too.
        val said = message("你看 https://resonance.channel/card/rich-story")
        assertEquals(said.text, carried(said, cards = mapOf("rich-story" to card)).words(said))
        val carriedCard = message("我昨天寫的", cardRef = "c1")
        assertEquals("我昨天寫的", carried(carriedCard, cards = mapOf("c1" to card)).words(carriedCard))
    }

    @Test fun aCardTheViewerCantSeeFallsBackToWhatTheMessageIsWithoutIt() {
        val gone = mapOf("rich-story" to null, "c1" to null)
        // A link is a link again: its preview if the server made one, else its words.
        val withPreview = message("https://resonance.channel/card/rich-story", preview = "https://resonance.channel/card/rich-story")
        assertTrue(carried(withPreview, gone) is Carried.Preview)
        val bare = message("https://resonance.channel/card/rich-story")
        assertEquals(Carried.Words, carried(bare, gone))
        assertEquals(bare.text, carried(bare, gone).words(bare))
        // A carried card shows nothing of itself: its words if any, else nothing at all.
        assertEquals(Carried.Words, carried(message("看這張", cardRef = "c1"), gone))
        assertEquals(Carried.Nothing, carried(message("", cardRef = "c1"), gone))
        // A read that failed (neither known nor being read) is treated the same until it is asked again.
        assertEquals(Carried.Nothing, carried(message("", cardRef = "c1")))
    }

    @Test fun aMessageWithoutACardCarriesItsPreviewOrJustItsWords() {
        assertTrue(carried(message("https://example.com", preview = "https://example.com/")) is Carried.Preview)
        assertEquals(Carried.Words, carried(message("hello")))
        // A reply to a note with no words of its own still has its bubble (the note's label).
        val note = ChatMessage("m2", "bob", "", Date(0), noteRef = MessagingApi.Note("c1", "n1"))
        assertEquals(Carried.Words, carried(note))
        assertEquals(Carried.Nothing, carried(message("")))
    }
}
