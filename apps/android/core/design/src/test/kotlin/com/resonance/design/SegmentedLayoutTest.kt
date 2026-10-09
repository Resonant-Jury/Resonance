package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The card page's actions are one row on a phone (SegmentedActionBar.tsx): the bar spans its
 * column and its segments share it evenly; when every label no longer fits, the bookmark (the
 * collapsible one) shows its glyph alone and takes only its own room, the others sharing the rest.
 */
class SegmentedLayoutTest {
    private val icons = listOf(true, true, true)
    private val collapsible = listOf(false, false, true)

    @Test fun onAPhoneTheSegmentsShareTheRowEvenly() {
        // 共振 | 寄小紙條 | 收藏 at 14: short words, room to spare.
        val labels = listOf(28f, 56f, 28f)
        assertFalse(SegmentedLayout.collapses(labels, icons, 370f, spread = true))
        assertEquals(listOf(370f / 3, 370f / 3, 370f / 3), SegmentedLayout.widths(labels, icons, collapsible, 370f, spread = true))
    }

    @Test fun withNoRoomForEveryLabelTheBookmarkIsItsGlyphAlone() {
        // Resonate | Send a note | Remove bookmark: each needs 2×8 + 16 + 8 + its words.
        val labels = listOf(64f, 76f, 112f)
        val need = labels.sumOf { (it + 40f).toDouble() }.toFloat()
        assertTrue(SegmentedLayout.collapses(labels, icons, need - 1f, spread = true))
        val widths = SegmentedLayout.widths(labels, icons, collapsible, 320f, spread = true)
        assertEquals(SegmentedLayout.ICON_ONLY, widths[2])
        assertEquals((320f - SegmentedLayout.ICON_ONLY) / 2, widths[0])
        assertEquals(widths[0], widths[1])
        // Every label that fits keeps its words.
        assertFalse(SegmentedLayout.collapses(labels, icons, need, spread = true))
    }

    @Test fun widerTheBarStandsAtItsOwnWidth() {
        val labels = listOf(64f, 160f, 66f)
        val widths = SegmentedLayout.widths(labels, icons, collapsible, 900f, spread = false)
        assertEquals(listOf(64f, 160f, 66f).map { it + 2 * SegmentedLayout.WIDE_PAD + SegmentedLayout.ICON + SegmentedLayout.GAP }, widths)
    }
}
