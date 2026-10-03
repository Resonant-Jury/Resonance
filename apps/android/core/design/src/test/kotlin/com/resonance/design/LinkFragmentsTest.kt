package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkFragmentsTest {
    // Three lines of ten characters, 10px a character, baselines 20/50/80.
    private val lineOf = { o: Int -> o / 10 }
    private val lineStart = { l: Int -> l * 10 }
    private val x = { o: Int -> (o % 10) * 10f }
    private val xe = { l: Int, o: Int -> if (o == l * 10 + 10) 100f else (o % 10) * 10f }
    private val baseline = { l: Int -> 20f + l * 30f }

    @Test fun aLinkOnOneLineIsOneFragment() {
        val f = linkFragments(2, 6, lineOf, lineStart, { it * 10 + 10 }, x, xe, baseline)
        assertEquals(listOf(LinkFragment(20f, 60f, 20f)), f)
    }

    @Test fun aWrappedLinkGetsAStrokeUnderEachLine() {
        // From offset 7 on line 0 to 25 on line 2; line 0's last cell is a trailing space (visible end 9).
        val f = linkFragments(7, 25, lineOf, lineStart, { if (it == 0) 9 else it * 10 + 10 }, x, xe, baseline)
        assertEquals(listOf(LinkFragment(70f, 90f, 20f), LinkFragment(0f, 90f, 50f), LinkFragment(0f, 50f, 80f)).map { it.baseline }, f.map { it.baseline })
        assertEquals(70f, f[0].left, 0f)
        assertEquals(90f, f[0].right, 0f)
        assertEquals(0f, f[2].left, 0f)
        assertEquals(50f, f[2].right, 0f)
    }

    @Test fun anEmptyOrSpaceOnlyRangeDrawsNothing() {
        assertTrue(linkFragments(4, 4, lineOf, lineStart, { it * 10 + 10 }, x, xe, baseline).isEmpty())
        assertTrue(linkFragments(9, 10, lineOf, lineStart, { 9 }, x, xe, baseline).isEmpty())
    }
}
