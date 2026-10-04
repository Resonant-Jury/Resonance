package com.resonance.design

import androidx.compose.ui.unit.LayoutDirection
import com.resonance.geometry.CornerRadii
import com.resonance.kit.chat.RunPosition
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Which corners a bubble in a run tucks: those facing its neighbours, on its sender's side. */
class BubbleCornersTest {
    private val r = 18.0
    private val t = 4.0

    @Test fun yoursTuckOnTheRightAndTheirsOnTheLeftLeftToRight() {
        // The first of a run tucks its bottom corner; the last its top one; a middle one both.
        assertEquals(CornerRadii(r, r, t, r), bubbleCorners(mine = true, RunPosition.First, r, LayoutDirection.Ltr))
        assertEquals(CornerRadii(r, t, r, r), bubbleCorners(mine = true, RunPosition.Last, r, LayoutDirection.Ltr))
        assertEquals(CornerRadii(r, r, r, t), bubbleCorners(mine = false, RunPosition.First, r, LayoutDirection.Ltr))
        assertEquals(CornerRadii(t, r, r, t), bubbleCorners(mine = false, RunPosition.Middle, r, LayoutDirection.Ltr))
    }

    @Test fun rightToLeftTheSidesSwapAsTheRowsDo() {
        // Yours sit on the left there, and tuck the left; theirs the right — as the plain stand-in does.
        assertEquals(CornerRadii(r, r, r, t), bubbleCorners(mine = true, RunPosition.First, r, LayoutDirection.Rtl))
        assertEquals(CornerRadii(t, r, r, t), bubbleCorners(mine = true, RunPosition.Middle, r, LayoutDirection.Rtl))
        assertEquals(CornerRadii(r, t, r, r), bubbleCorners(mine = false, RunPosition.Last, r, LayoutDirection.Rtl))
    }

    @Test fun aBubbleOnItsOwnIsRoundAllRound() {
        for (direction in LayoutDirection.entries) {
            assertNull(bubbleCorners(mine = true, RunPosition.Single, r, direction))
            assertNull(bubbleCorners(mine = false, RunPosition.Single, r, direction))
        }
    }

    @Test fun aShortBubbleTucksNoDeeperThanItsOwnRadius() {
        assertEquals(CornerRadii(3.0, 3.0, 3.0, 3.0), bubbleCorners(mine = true, RunPosition.Middle, 3.0, LayoutDirection.Ltr))
    }
}
