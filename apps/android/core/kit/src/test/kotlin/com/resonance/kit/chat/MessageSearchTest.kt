package com.resonance.kit.chat

import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals

/** Searching the thread: phrases, case, full-width letters, Chinese, where the matches sit, newest first. */
class MessageSearchTest {
    private fun message(id: String, text: String, at: Long = 0) = ChatMessage(id, "alice", text, Date(at))

    @Test fun findsEveryOccurrenceWithItsRangeAsWritten() {
        val hits = MessageSearch.find(listOf(message("a", "Coffee or coffee? COFFEE!")), "coffee")
        assertEquals(listOf(SearchHit("a", listOf(0..5, 10..15, 18..23))), hits)
    }

    @Test fun newestMessageFirst() {
        val messages = listOf(message("old", "hello there", 1), message("mid", "no match", 2), message("new", "say hello", 3))
        assertEquals(listOf("new", "old"), MessageSearch.find(messages, "hello").map { it.messageId })
    }

    @Test fun fullWidthAndPlainAsciiMatchEachOther() {
        // A CJK keyboard types full-width letters and digits.
        val full = String(charArrayOf(0xFF21.toChar(), 0xFF22.toChar(), 0xFF23.toChar(), 0xFF11.toChar(), 0xFF12.toChar()))
        assertEquals(listOf(SearchHit("a", listOf(4..8))), MessageSearch.find(listOf(message("a", "see abc12")), full))
        assertEquals(listOf(SearchHit("a", listOf(0..4))), MessageSearch.find(listOf(message("a", full + " is here")), "abc12"))
    }

    @Test fun anIdeographicSpaceIsASpace() {
        val gap = Char(0x3000)
        assertEquals(listOf(SearchHit("a", listOf(0..11))), MessageSearch.find(listOf(message("a", "good${gap}morning")), "good morning"))
    }

    @Test fun findsChineseText() {
        val hits = MessageSearch.find(listOf(message("a", "今天的共振很好，共振真的好")), "共振")
        assertEquals(listOf(SearchHit("a", listOf(3..4, 8..9))), hits)
    }

    @Test fun aBlankQueryOrAMessageWithoutTextMatchesNothing() {
        val messages = listOf(message("a", "hello"), message("card", ""))
        assertEquals(emptyList(), MessageSearch.find(messages, ""))
        assertEquals(emptyList(), MessageSearch.find(messages, "   "))
        assertEquals(emptyList(), MessageSearch.find(messages, "zzz"))
    }

    @Test fun matchesDontOverlap() {
        assertEquals(listOf(SearchHit("a", listOf(0..1, 2..3))), MessageSearch.find(listOf(message("a", "aaaa")), "aa"))
    }

    @Test fun theQueryIsTrimmed() {
        assertEquals(listOf(SearchHit("a", listOf(6..10))), MessageSearch.find(listOf(message("a", "hello world")), "  world  "))
    }

    @Test fun positionsHoldForCharactersWhoseLowerCaseIsLonger() {
        // 'İ' lower-cases to two characters as a whole string; folded one at a time it stays one, so ranges line up.
        val text = String(charArrayOf(0x130.toChar())) + "ab"
        assertEquals(listOf(SearchHit("a", listOf(1..2))), MessageSearch.find(listOf(message("a", text)), "ab"))
    }
}
