package com.resonance.design

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The width classes (design note §8): the shared table every platform answers the same way. */
class LayoutClassTest {
    @Test fun classesFollowTheWebsBreakpoints() {
        assertEquals(LayoutClass.Compact, LayoutClass.of(390f))
        assertEquals(LayoutClass.Compact, LayoutClass.of(599f))
        assertEquals(LayoutClass.Medium, LayoutClass.of(600f))
        assertEquals(LayoutClass.Medium, LayoutClass.of(899f))
        assertEquals(LayoutClass.Expanded, LayoutClass.of(900f))
        assertFalse(LayoutClass.Compact.sideRail)
        assertTrue(LayoutClass.Medium.sideRail)
        assertTrue(LayoutClass.Expanded.sideRail)
    }

    @Test fun theWriterSplitsFrom1200() {
        assertFalse(LayoutClass.writerSplit(1199f))
        assertTrue(LayoutClass.writerSplit(1200f))
    }

    @Test fun pagePaddingIsFourPercentBetween20And48() {
        assertEquals(20f, LayoutClass.pad(390f), 1e-4f)
        assertEquals(32f, LayoutClass.pad(800f), 1e-4f)
        assertEquals(48f, LayoutClass.pad(1366f), 1e-4f)
    }

    @Test fun theBorderedFeedHasTwoOrThreeColumnsOnlyWhenExpanded() {
        assertEquals(2, LayoutClass.feedColumns(LayoutClass.Expanded, 959f))
        assertEquals(3, LayoutClass.feedColumns(LayoutClass.Expanded, 960f))
        assertEquals(1, LayoutClass.feedColumns(LayoutClass.Medium, 1000f))
        assertEquals(1, LayoutClass.feedColumns(LayoutClass.Compact, 1000f))
    }

    @Test fun bubblesAre72PercentOfTheListCappedAt520() {
        assertEquals(257.76f, LayoutClass.bubbleMax(390f), 1e-3f)
        assertEquals(516.96f, LayoutClass.bubbleMax(750f), 1e-3f)
        assertEquals(520f, LayoutClass.bubbleMax(1000f), 1e-3f)
    }

    @Test fun aReadingColumnIsCentredButNeverCloserThanThePad() {
        assertEquals(32f, LayoutClass.columnInset(712f, 32f), 1e-4f)
        assertEquals(256f, LayoutClass.columnInset(1192f, 48f), 1e-4f)
    }

    @Test fun theWindowsGridAndRailFollowItsWidth() {
        // Pixel Tablet: 800 portrait is medium (one column of bands); 1280 landscape, beside the rail, has three columns.
        val portrait = WindowLayout(800.dp, railWidth = 88.dp)
        assertEquals(LayoutClass.Medium, portrait.cls)
        assertEquals(1, portrait.feedColumns)
        assertEquals(32f, portrait.columnInset().value, 1e-4f)
        val landscape = WindowLayout(1280.dp, railWidth = 88.dp)
        assertEquals(LayoutClass.Expanded, landscape.cls)
        assertEquals(1096f, landscape.gridWidth.value, 1e-3f)
        assertEquals(3, landscape.feedColumns)
        assertTrue(landscape.writerSplit)
        // iPad Pro 13" portrait, for the record: 1032 − 88 − 2 × 41.28 is two columns.
        assertEquals(2, WindowLayout(1032.dp, railWidth = 88.dp).feedColumns)
        // A phone has no inset column, whatever it measures.
        assertEquals(0f, WindowLayout.Phone.columnInset().value, 1e-4f)
    }

    @Test fun theCardPageHasItsRailOnlyWhenExpanded() {
        assertEquals(CardPageColumns(20.dp, 20.dp, null), WindowLayout(390.dp).cardPage())
        // 800 beside the rail: 712 wide, a 760 column doesn't fit, so the pad's 32 each side.
        assertEquals(CardPageColumns(32.dp, 32.dp, null), WindowLayout(800.dp, 88.dp).cardPage())
        // 1280 beside the rail: 1192 content, 48 pad; the article 720 from 48, the rail at the box's end (48 + 1096 − 260).
        val wide = WindowLayout(1280.dp, 88.dp).cardPage()
        assertEquals(48f, wide.start.value, 1e-3f)
        assertEquals(1192f - 48f - 720f, wide.end.value, 1e-3f)
        assertEquals(884f, wide.railStart!!.value, 1e-3f)
        // Just expanded (900 + rail): the article gives way to the rail and its 48.
        val narrow = WindowLayout(988.dp, 88.dp).cardPage()
        assertEquals(900f - 2 * 39.52f - 260f - 48f, 900f - narrow.start.value - narrow.end.value, 1e-2f)
    }
}
