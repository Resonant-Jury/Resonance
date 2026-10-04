package com.resonance.kit.chat

import com.resonance.kit.api.MessagingApi
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** A message document read as the thread draws it: the quote, the preview and its picture, old messages without either. */
class ChatMessageTest {
    private val origin = "http://10.0.0.2:3300"
    private val at = Date(1_000)
    private fun read(vararg fields: Pair<String, Any?>) = ChatMessage.from("m1", mapOf(*fields), at, origin)

    @Test fun anOldMessageHasNeitherAQuoteNorAPreview() {
        val m = read("senderId" to "alice", "text" to "hi")
        assertEquals(ChatMessage("m1", "alice", "hi", at), m)
        assertNull(m.replyTo)
        assertNull(m.preview)
        assertEquals("m1", m.key)
        assertTrue(m.canReply)
    }

    @Test fun aSharedCardAndANoteComeThrough() {
        val m = read("senderId" to "bob", "text" to "", "cardRef" to "walk", "noteRef" to mapOf("cardId" to "walk", "noteId" to "n1"))
        assertEquals("walk", m.cardRef)
        assertEquals(MessagingApi.Note("walk", "n1"), m.noteRef)
    }

    @Test fun aNoteInTheThreadIsANoteAndAnUnknownKindIsAPlainMessage() {
        val note = read("senderId" to "bob", "text" to "I walked there too", "cardRef" to "walk", "kind" to "note")
        assertTrue(note.isNote)
        assertEquals("walk", note.cardRef)
        // Never "in reply to your note": a note in the thread carries no noteRef.
        assertNull(note.noteRef)
        assertFalse(read("senderId" to "bob", "text" to "hi").isNote)
        // A kind a later server writes is drawn as the message it is.
        val unknown = read("senderId" to "bob", "text" to "hi", "cardRef" to "walk", "kind" to "letter")
        assertFalse(unknown.isNote)
        assertEquals("walk", unknown.cardRef)
    }

    @Test fun aReplyKeepsTheQuoteTheServerSnapshotted() {
        val m = read(
            "senderId" to "bob", "text" to "agreed",
            "replyTo" to mapOf("id" to "m0", "senderId" to "alice", "text" to "shall we?", "cardRef" to "walk"),
        )
        assertEquals(ReplyQuote("m0", "alice", "shall we?", "walk"), m.replyTo)
        // A quote of a card alone has no text.
        assertEquals(ReplyQuote("m0", "alice", "", null), read("replyTo" to mapOf("id" to "m0", "senderId" to "alice", "text" to "")).replyTo)
        // Without an id there is nothing to quote.
        assertNull(read("replyTo" to mapOf("senderId" to "alice", "text" to "x")).replyTo)
    }

    @Test fun aQuoteIsCutAtOneHundredFortyCodePoints() {
        val long = "🙂".repeat(200)
        val quote = read("replyTo" to mapOf("id" to "m0", "senderId" to "alice", "text" to long)).replyTo!!
        assertEquals(140, quote.text.codePointCount(0, quote.text.length))
        assertEquals(long.substring(0, 280), quote.text)
        assertEquals(ReplyQuote.cut("short"), "short")
    }

    @Test fun aPreviewComesWithItsPictureResolvedAgainstTheApiOrigin() {
        val m = read(
            "text" to "look https://example.com/a",
            "preview" to mapOf(
                "url" to "https://example.com/a", "title" to " Example page ", "description" to "About it", "siteName" to "Example",
                "image" to "/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc",
            ),
        )
        assertEquals(
            LinkPreview(
                "https://example.com/a", "Example page", "About it", "Example",
                "http://10.0.0.2:3300/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc",
            ),
            m.preview,
        )
    }

    @Test fun aPreviewNeedsATitleAndALinkWeWouldOpen() {
        assertNull(read("preview" to mapOf("url" to "https://example.com/", "title" to "  ")).preview)
        assertNull(read("preview" to mapOf("url" to "https://example.com/")).preview)
        assertNull(read("preview" to mapOf("url" to "javascript:alert(1)", "title" to "x")).preview)
        assertNull(read("preview" to mapOf("url" to "https://user@example.com/", "title" to "x")).preview)
        assertNull(read("preview" to mapOf("title" to "x")).preview)
        val bare = read("preview" to mapOf("url" to "https://example.com", "title" to "x")).preview!!
        assertEquals("https://example.com/", bare.url)
        assertNull(bare.description)
        assertNull(bare.imageUrl)
    }

    @Test fun onlyOurImageProxyMakesAPicture() {
        fun image(path: Any?) = read("preview" to mapOf("url" to "https://example.com/", "title" to "x", "image" to path)).preview!!.imageUrl
        assertNull(image("https://tracker.example.net/pixel.gif"))
        assertNull(image("//tracker.example.net/pixel.gif"))
        assertNull(image("/other/path.png"))
        assertNull(image("/api/link-image"))
        assertNull(image("/api/link-image?u=a b"))
        assertNull(image(42))
        assertNull(image(null))
        assertEquals("http://10.0.0.2:3300/api/link-image?u=x&s=y", image("/api/link-image?u=x&s=y"))
    }

    @Test fun theOriginsTrailingSlashDoesntDoubleUp() {
        assertEquals("https://resonance.channel/api/link-image?u=x", ChatMessage.imageUrl("/api/link-image?u=x", "https://resonance.channel/"))
    }

    @Test fun aMessageOnItsWayCantBeRepliedTo() {
        val sending = ChatMessage("c1", "alice", "hi", at, delivery = Delivery.Sending)
        assertTrue(sending.isPending)
        assertFalse(sending.canReply)
        assertFalse(ChatMessage("c1", "alice", "hi", at, delivery = Delivery.Sent).canReply)
        assertFalse(ChatMessage("c1", "alice", "hi", at, delivery = Delivery.Failed).canReply)
    }

    @Test fun aReplyToAMessageQuotesItsFirstWordsAndItsCard() {
        val original = ChatMessage("m0", "alice", "x".repeat(300), at, cardRef = "walk")
        assertEquals(ReplyQuote("m0", "alice", "x".repeat(140), "walk"), ReplyQuote.of(original))
    }
}
