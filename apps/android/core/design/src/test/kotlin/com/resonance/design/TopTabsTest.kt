package com.resonance.design

import com.resonance.design.generated.IconName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The header's tabs on medium and expanded windows (design note B2): what they hold and how they fit. */
class TopTabsTest {
    @Test fun theTabsAreTheBarsWithoutThePenEachKeepingItsPlaceInTheBar() {
        // The bar's order (Navigation's tabItems): the pen in the middle.
        val bar = listOf(
            OrganicTabItem("feed", "Feed", IconName.Sparkle),
            OrganicTabItem("messages", "Messages", IconName.Chat),
            OrganicTabItem("write", "Write", IconName.Pen, isAction = true),
            OrganicTabItem("notifications", "Notifications", IconName.Bell),
            OrganicTabItem("cards", "Card box", IconName.Cards),
        )
        val tabs = topTabsOrder(bar)
        assertEquals(listOf("feed", "messages", "notifications", "cards"), tabs.map { it.value.id })
        // Each wash keeps the bar's seed (index × 29 + 7).
        assertEquals(listOf(0, 1, 3, 4), tabs.map { it.index })
    }

    @Test fun aMediumWindowShowsGlyphsAndLeavesTheBrandItsRoom() {
        // 600: four 48 glyphs, 2 apart, 4 in from the track's ends — 206; the pad is 24.
        val group = TopTabsFit.groupWidth(List(4) { TopTabsFit.ICON_ITEM })
        assertEquals(206f, group, 1e-4f)
        assertEquals(157f, TopTabsFit.leadingMax(600f, group, LayoutClass.pad(600f)), 1e-4f)
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
}
