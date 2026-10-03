package com.resonance.kit.chat

import com.resonance.kit.chat.MessageHistory.Entry
import com.resonance.kit.chat.MessageHistory.Merged
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * What the thread holds of a conversation: the live window (the newest few) merged with older pages
 * read on demand, ordered by send time, with the cursor of the oldest message to read the next page from.
 */
class MessageHistoryTest {
    private fun message(n: Int, text: String = "m$n", sender: String = "alice") = ChatMessage("m%03d".format(n), sender, text, Date(1_000L * n))
    private fun entries(range: IntProgression) = range.map { Entry(message(it), "cursor-$it") }
    private fun ids(history: MessageHistory<String>) = history.messages.map { it.id }

    @Test fun theWindowIsHeldOldestFirstWhateverOrderItArrivesIn() {
        val history = MessageHistory<String>(liveLimit = 3)
        // The listener's query is newest-first.
        assertEquals(Merged.Changed, history.mergeWindow(entries(5 downTo 3)))
        assertEquals(listOf("m003", "m004", "m005"), ids(history))
        assertEquals("cursor-3", history.oldestCursor)
    }

    @Test fun messagesThatSlideOutOfTheWindowStay() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(5 downTo 3))
        // Two new messages push the oldest two out of the newest-three window.
        history.mergeWindow(entries(7 downTo 5))
        assertEquals(listOf("m003", "m004", "m005", "m006", "m007"), ids(history))
        // The next older page still starts after the oldest held.
        assertEquals("cursor-3", history.oldestCursor)
        assertTrue(history.hasOlder)
    }

    @Test fun anOlderPageGoesBeforeAndMovesTheCursor() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(10 downTo 8))
        assertTrue(history.mergePage(entries(7 downTo 5), limit = 3))
        assertEquals((5..10).map { "m%03d".format(it) }, ids(history))
        assertEquals("cursor-5", history.oldestCursor)
        assertTrue(history.hasOlder)
        // A short page was the last one.
        assertTrue(history.mergePage(entries(4 downTo 3), limit = 3))
        assertEquals("cursor-3", history.oldestCursor)
        assertFalse(history.hasOlder)
        // And the window moving on afterwards doesn't say there is more.
        history.mergeWindow(entries(11 downTo 9))
        assertFalse(history.hasOlder)
        assertEquals(9, history.size)
    }

    @Test fun aWindowShorterThanTheLimitFromTheServerIsTheWholeConversation() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(2 downTo 1))
        assertFalse(history.hasOlder)
        history.mergeWindow(entries(3 downTo 1))
        assertTrue(history.hasOlder)
    }

    @Test fun aCachedWindowCantSayThereIsNothingOlder() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(2 downTo 1), authoritative = false)
        assertTrue(history.hasOlder)
        // The server's answer settles it.
        history.mergeWindow(entries(2 downTo 1), authoritative = true)
        assertFalse(history.hasOlder)
    }

    @Test fun anEmptyConversationHasNothingOlder() {
        val history = MessageHistory<String>(liveLimit = 3)
        assertEquals(Merged.Unchanged, history.mergeWindow(emptyList()))
        assertFalse(history.hasOlder)
        assertNull(history.oldestCursor)
    }

    @Test fun anUpdatedMessageReplacesItself() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(5 downTo 3))
        val preview = LinkPreview("https://example.com/", "Example", null, null, null)
        val updated = message(4).copy(preview = preview)
        assertEquals(Merged.Changed, history.mergeWindow(listOf(Entry(message(5), "cursor-5"), Entry(updated, "cursor-4"), Entry(message(3), "cursor-3"))))
        assertEquals(3, history.size)
        assertEquals(preview, history["m004"]!!.preview)
        // The same window again changes nothing (and the list stays the same object).
        val before = history.messages
        assertEquals(Merged.Unchanged, history.mergeWindow(listOf(Entry(message(5), "cursor-5"), Entry(updated, "cursor-4"), Entry(message(3), "cursor-3"))))
        assertSame(before, history.messages)
    }

    @Test fun theOldestMessagesNewSnapshotRefreshesTheCursor() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(5 downTo 3))
        history.mergeWindow(listOf(Entry(message(5), "c5"), Entry(message(4), "c4"), Entry(message(3), "c3-again")))
        assertEquals("c3-again", history.oldestCursor)
    }

    @Test fun messagesSentTogetherKeepAStableOrderById() {
        val history = MessageHistory<String>(liveLimit = 5)
        val at = Date(5_000)
        history.mergeWindow(listOf("b", "c", "a").map { Entry(ChatMessage(it, "alice", it, at), it) })
        assertEquals(listOf("a", "b", "c"), ids(history))
    }

    @Test fun aWindowThatSharesNothingStartsTheHistoryAfresh() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(5 downTo 3))
        history.mergePage(entries(2 downTo 1), limit = 2)
        // The listener was away while the thread moved far past what was held: there would be a gap.
        assertEquals(Merged.Restarted, history.mergeWindow(entries(40 downTo 38)))
        assertEquals(listOf("m038", "m039", "m040"), ids(history))
        assertEquals("cursor-38", history.oldestCursor)
        assertTrue(history.hasOlder)
    }

    @Test fun clearForgetsEverything() {
        val history = MessageHistory<String>(liveLimit = 3)
        history.mergeWindow(entries(5 downTo 3))
        history.clear()
        assertEquals(emptyList(), history.messages)
        assertNull(history.oldestCursor)
        assertFalse(history.hasOlder)
        assertFalse("m003" in history)
    }

    @Test fun fiftyIsTheDefaultWindow() {
        val history = MessageHistory<String>()
        history.mergeWindow(entries(60 downTo 11))
        assertEquals(50, history.size)
        assertTrue(history.hasOlder)
    }
}
