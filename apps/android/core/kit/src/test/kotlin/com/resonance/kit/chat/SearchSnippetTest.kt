package com.resonance.kit.chat

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** What a search result shows of a message: the stretch around the first match. */
class SearchSnippetTest {
    @Test fun aShortMessageIsShownWhole() {
        val s = SearchSnippet.of("我同意你說的", listOf(1..2))
        assertEquals("我同意你說的", s.text)
        assertEquals(listOf(1..2), s.ranges)
    }

    @Test fun aLongMessageIsCutAroundTheFirstMatchWithEllipses() {
        val text = "a".repeat(100) + "needle" + "b".repeat(100)
        val s = SearchSnippet.of(text, listOf(100..105))
        assertTrue(s.text.startsWith("…") && s.text.endsWith("…"))
        assertEquals("needle", s.text.substring(s.ranges.single().first, s.ranges.single().last + 1))
        // The match sits near the front of what is shown, not the middle of nowhere.
        assertTrue(s.ranges.single().first <= SearchSnippet.LEAD + 2)
        assertTrue(s.text.length <= SearchSnippet.MAX_LENGTH + 2)
    }

    @Test fun aMatchNearTheStartKeepsTheStartAndOnlyCutsTheEnd() {
        val text = "needle" + "x".repeat(200)
        val s = SearchSnippet.of(text, listOf(0..5))
        assertTrue(!s.text.startsWith("…") && s.text.endsWith("…"))
        assertEquals(listOf(0..5), s.ranges)
    }

    @Test fun laterMatchesInsideTheWindowAreKeptAndOnesOutsideDropped() {
        val text = "xx needle yy needle " + "z".repeat(200) + " needle"
        val hits = listOf(3..8, 13..18, text.length - 6..text.length - 1)
        val s = SearchSnippet.of(text, hits)
        assertEquals(2, s.ranges.size)
        s.ranges.forEach { assertEquals("needle", s.text.substring(it.first, it.last + 1)) }
    }

    @Test fun newlinesBecomeSpacesSoALineStaysALine() {
        val s = SearchSnippet.of("one\ntwo\r\nthree", listOf(4..6))
        assertEquals("one two  three", s.text)
        assertEquals("two", s.text.substring(s.ranges.single().first, s.ranges.single().last + 1))
    }

    @Test fun neverSplitsASurrogatePair() {
        val text = "😀".repeat(80) + "needle" + "😀".repeat(80)
        val start = 160
        val s = SearchSnippet.of(text, listOf(start..start + 5))
        // Every character of what is shown is whole: no lone surrogates at the cuts.
        var i = 0
        while (i < s.text.length) {
            val c = s.text[i]
            if (Character.isHighSurrogate(c)) { assertTrue(i + 1 < s.text.length && Character.isLowSurrogate(s.text[i + 1])); i += 2 } else { assertTrue(!Character.isLowSurrogate(c)); i++ }
        }
        assertEquals("needle", s.text.substring(s.ranges.single().first, s.ranges.single().last + 1))
    }
}
