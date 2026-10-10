package com.resonance.design

import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
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
        // The tabs move into the header from medium on; they carry their labels only when expanded.
        assertFalse(LayoutClass.Compact.topTabs)
        assertTrue(LayoutClass.Medium.topTabs)
        assertTrue(LayoutClass.Expanded.topTabs)
        assertFalse(LayoutClass.Medium.tabLabels)
        assertTrue(LayoutClass.Expanded.tabLabels)
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

    @Test fun theWindowsGridFollowsItsWidth() {
        // Pixel Tablet: 800 portrait is medium (one column of bands); 1280 landscape has three columns.
        val portrait = WindowLayout(800.dp)
        assertEquals(LayoutClass.Medium, portrait.cls)
        assertEquals(1, portrait.feedColumns)
        // The 680 reading column in the middle of 800.
        assertEquals(60f, portrait.columnInset().value, 1e-4f)
        val landscape = WindowLayout(1280.dp)
        assertEquals(LayoutClass.Expanded, landscape.cls)
        assertEquals(1104f, landscape.gridWidth.value, 1e-3f)
        assertEquals(3, landscape.feedColumns)
        assertTrue(landscape.writerSplit)
        // iPad Pro 13" portrait, for the record: 1032 − 2 × 41.28 = 949 is two columns; 1376 landscape is three.
        assertEquals(2, WindowLayout(1032.dp).feedColumns)
        assertEquals(3, WindowLayout(1376.dp).feedColumns)
        // A phone has no inset column, whatever it measures.
        assertEquals(0f, WindowLayout.Phone.columnInset().value, 1e-4f)
    }

    @Test fun theCardPageHasItsRailOnlyWhenExpanded() {
        assertEquals(CardPageColumns(20.dp, 20.dp, null), WindowLayout(390.dp).cardPage())
        // 800: a 760 column doesn't fit in 800 − 2 × 32, so the pad's 32 each side.
        assertEquals(CardPageColumns(32.dp, 32.dp, null), WindowLayout(800.dp).cardPage())
        // 1280: a 1200 box from 40, the pad 48 in it; the article 720 from 88, the rail at the box's end (88 + 1104 − 260).
        val wide = WindowLayout(1280.dp).cardPage()
        assertEquals(88f, wide.start.value, 1e-3f)
        assertEquals(1280f - 88f - 720f, wide.end.value, 1e-3f)
        assertEquals(932f, wide.railStart!!.value, 1e-3f)
        // Just expanded (900): the article gives way to the rail and its 48.
        val narrow = WindowLayout(900.dp).cardPage()
        assertEquals(900f - 2 * 36f - 260f - 48f, 900f - narrow.start.value - narrow.end.value, 1e-2f)
    }

    @Test fun aTabletsPagesStart32UnderTheHeadersPenLineAndAPhonesKeepTheirOwn() {
        // Round 5 E2: measured from the bar's foot, its pen line 1.4 + INK above it.
        assertEquals(16f, LayoutClass.Compact.firstContentGap(16.dp).value, 0.001f)
        assertEquals(20f, LayoutClass.Compact.firstContentGap(20.dp).value, 0.001f)
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(32f - 1.4f - Tokens.Ink.value, cls.firstContentGap(16.dp).value, 0.001f)
            assertEquals(cls.firstContentGap(16.dp), cls.firstContentGap(20.dp))
        }
        // The feed's grid (an expanded window, its list starting under the bar's wave band): 32 under the line too.
        assertEquals(HeaderEdgeHeight.value + 32f - BarLineInset.value, GridUnderBar.value, 0.001f)
    }

    @Test fun aTabletsPullIsHalfAsBigAgain() {
        assertEquals(1f, LayoutClass.Compact.pullScale())
        assertEquals(1.5f, LayoutClass.Medium.pullScale())
        assertEquals(1.5f, LayoutClass.Expanded.pullScale())
    }
}
