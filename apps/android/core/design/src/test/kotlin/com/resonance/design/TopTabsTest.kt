package com.resonance.design

import com.resonance.design.generated.IconName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The header's tabs on medium and expanded windows (design note B2, round 5 part C): what they hold and how they fit. */
class TopTabsTest {
    @Test fun theSegmentsAreTheFourTabsWithoutThePen() {
        // The bar's order (Navigation's tabItems): the pen in the middle. The group holds the four
        // tabs alone (the owner's revision): the pen stays a chip at a root header's end.
        val bar = listOf(
            OrganicTabItem("feed", "Feed", IconName.Sparkle),
            OrganicTabItem("messages", "Messages", IconName.Chat),
            OrganicTabItem("write", "Write", IconName.Pen, isAction = true),
            OrganicTabItem("notifications", "Notifications", IconName.Bell),
            OrganicTabItem("cards", "Card box", IconName.Cards),
        )
        val tabs = topTabsOrder(bar)
        assertEquals(listOf("feed", "messages", "notifications", "cards"), tabs.map { it.value.id })
        assertTrue(tabs.none { it.value.isAction })
        assertEquals(listOf(0, 1, 3, 4), tabs.map { it.index })
    }

    @Test fun aMediumWindowShowsGlyphsAndLeavesTheBrandItsRoom() {
        // 600: four 52 glyph segments abutting (the seams lie on their edges) — 208; the pad is 24.
        val group = TopTabsFit.groupWidth(List(4) { TopTabsFit.ICON_ITEM })
        assertEquals(208f, group, 1e-4f)
        assertEquals(156f, TopTabsFit.leadingMax(600f, group, LayoutClass.pad(600f)), 1e-4f)
        // The group is 44 tall in the header's 72 row: 14 above and below.
        assertEquals(72f, TopBarRow.value, 0f)
        assertEquals(14f, (TopBarRow.value - TopTabsFit.HEIGHT) / 2, 0f)
        assertFalse(TopTabsFit.labels(LayoutClass.Medium, 300f, 834f, LayoutClass.pad(834f)))
    }

    @Test fun anExpandedWindowShowsLabelsUnlessTheyCrowdTheBar() {
        // A label 28 wide (two CJK characters at 14) makes an item of 82.
        assertEquals(82f, TopTabsFit.labelledItem(28f), 1e-4f)
        val zh = TopTabsFit.groupWidth(List(4) { TopTabsFit.labelledItem(42f) })
        assertTrue(TopTabsFit.labels(LayoutClass.Expanded, zh, 1280f, 48f))
        // At exactly 900 (pad 36) the room is 900 − 2 × 188 = 524: a wider group falls back to glyphs.
        assertTrue(TopTabsFit.labels(LayoutClass.Expanded, 524f, 900f, 36f))
        assertFalse(TopTabsFit.labels(LayoutClass.Expanded, 525f, 900f, 36f))
    }

    @Test fun aTabsUnreadChipNeverCoversItsLabel() {
        // A labelled segment: 14 padding, the 20 glyph, 6, the label (from 40), 14. The chip hangs (+8, −7)
        // off the glyph's corner; with a count the glyph steps 5 into the padding, so a chip of either
        // width (19, 26 past 9) ends 3 before the label and stays inside the segment, clear of the
        // seam before it (a wobble of 1.6 either side of the segment's edge).
        val shift = TopTabBadge.glyphShift(labelled = true, badge = 12)
        assertEquals(5f, shift, 1e-4f)
        val glyphLeft = 14f - shift
        val labelStart = 14f + 20f + TopTabBadge.LABEL_GAP
        val chipRight = glyphLeft + 20f + TopTabBadge.OFFSET_X
        assertTrue(labelStart - chipRight >= 2f)
        for (chipWidth in listOf(19f, 26f)) assertTrue(chipRight - chipWidth >= 1.6f)
        // The label and the item keep their places: the item is as wide with a count as without.
        assertEquals(TopTabsFit.labelledItem(28f), 14f + 20f + TopTabBadge.LABEL_GAP + 28f + 14f, 1e-4f)
        // Only the glyph moves, and only beside words with a count.
        assertEquals(0f, TopTabBadge.glyphShift(labelled = true, badge = 0), 0f)
        assertEquals(0f, TopTabBadge.glyphShift(labelled = false, badge = 8), 0f)
    }

    @Test fun aPushedPagesContextStaysOnTheWindowsCentreClearOfBothEnds() {
        // 834 (pad 33): the arrow reaches 17 + 48 = 65 in, two actions 21 + 96 = 117: the wider end
        // sets both sides, so the context keeps the window's centre — 834 − 2 × (117 + 16) = 568.
        assertEquals(568f, InlineBarCentre.room(834f, 65f, 117f)!!, 1e-4f)
        assertEquals(InlineBarCentre.room(834f, 117f, 65f), InlineBarCentre.room(834f, 65f, 117f))
        // Under 72 of room nothing shows in the middle.
        assertNull(InlineBarCentre.room(300f, 65f, 100f))
    }

    @Test fun aTitleComesIntoTheBarOnceItHasGoneUpUnderIt() {
        // The title's bottom lies 380 below the article's top; the list starts on the bar's line.
        assertFalse(scrolledUnderBar(0, 0, 380f))
        assertFalse(scrolledUnderBar(0, 379, 380f))
        assertTrue(scrolledUnderBar(0, 380, 380f))
        // Not measured yet: not under; the article gone altogether: under.
        assertFalse(scrolledUnderBar(0, 5000, null))
        assertTrue(scrolledUnderBar(1, 0, null))
    }
}
