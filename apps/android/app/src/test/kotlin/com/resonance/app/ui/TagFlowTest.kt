package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** How the tag field breaks into lines (WriteParts.kt's TagFlow): pills in order, the input row on what is left of the last line. */
class TagFlowTest {
    private val gap = 8
    private val entryMin = 190
    private val width = 300

    private fun lines(vararg pills: Int) = breakTagLines(pills.toList(), entryMin, width, gap)

    @Test fun noTagsMeansTheInputRowAlone() {
        val l = lines()
        assertEquals(1, l.size)
        assertEquals(0, l[0].pills)
        assertTrue(l[0].entry)
    }

    @Test fun theInputRowSharesTheLineWhenEnoughOfItIsLeft() {
        // 80 + 8 + 190 = 278 <= 300
        val l = lines(80)
        assertEquals(1, l.size)
        assertEquals(1, l[0].pills)
        assertTrue(l[0].entry)
    }

    @Test fun theInputRowGoesDownWhenLessThanItsLeastIsLeft() {
        // 100 + 8 + 190 = 298 fits the 300; 120 + 8 + 190 = 318 does not.
        assertEquals(1, lines(100).size)
        val l = lines(120)
        assertEquals(2, l.size)
        assertEquals(1, l[0].pills)
        assertFalse(l[0].entry)
        assertEquals(0, l[1].pills)
        assertTrue(l[1].entry)
    }

    @Test fun pillsWrapAsWordsDo() {
        // 140 + 8 + 140 = 288 fits one line; the third starts the next, and the input row below it.
        val l = lines(140, 140, 140)
        assertEquals(listOf(2, 1, 0), l.map { it.pills })
        assertEquals(listOf(false, false, true), l.map { it.entry })
    }

    @Test fun theLastLineKeepsItsPillsAndTheInputWhenTheyFit() {
        // Line 1: 140 + 8 + 140; line 2: 60, then the input row (60 + 8 + 190 = 258).
        val l = lines(140, 140, 60)
        assertEquals(listOf(2, 1), l.map { it.pills })
        assertEquals(listOf(false, true), l.map { it.entry })
    }

    @Test fun aPillWiderThanTheFieldSitsAlone() {
        val l = lines(400, 50)
        assertEquals(listOf(1, 1), l.map { it.pills })
        assertEquals(listOf(false, true), l.map { it.entry })
    }

    @Test fun everyPillIsOnExactlyOneLineAndTheInputRowEndsTheLast() {
        val widths = listOf(70, 90, 110, 60, 130, 80, 100)
        val l = breakTagLines(widths, entryMin, width, gap)
        assertEquals(widths.size, l.sumOf { it.pills })
        assertEquals(1, l.count { it.entry })
        assertTrue(l.last().entry)
    }
}
