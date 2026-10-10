package com.resonance.design

import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The card page's reading progress (design note §3): how far the story's top has passed the bar's pen line, over what is left to see. */
class ReadingProgressTest {
    // The bar's line 100 down, 700 of the story visible under the bar, a 2100 story.
    private fun p(storyTop: Float, storyHeight: Float = 2100f) = readingProgress(storyTop, storyHeight, lineY = 100f, visible = 700f)

    @Test fun isNothingWhileTheStoryStartsBelowTheBarsLine() {
        assertEquals(0f, p(400f))
        assertEquals(0f, p(100f))
    }

    @Test fun fillsAsTheStoryPassesUnderTheLineAndIsWholeWhenItsFootReachesTheScreensFoot() {
        assertEquals(0.5f, p(100f - 700f), 1e-6f)
        assertEquals(1f, p(100f - 1400f), 1e-6f)
        assertEquals(1f, p(-5000f))
    }

    @Test fun showsNothingForAStoryThatFitsTheScreen() {
        assertEquals(0f, p(-300f, storyHeight = 700f))
        assertEquals(0f, p(-300f, storyHeight = 300f))
        assertEquals(0f, p(-300f, storyHeight = 0f))
    }

    @Test fun isTheHeadersOwnPenInTheBrighterOrangeWithAGlowOfItsColour() {
        // Round 5 E1: --reading-progress at the pen's own width (1.8, INK) over the line it rides on,
        // with a soft glow behind it: the same colour at 55 %, blurred 4.
        assertEquals(Tokens.ReadingProgress, ReadingProgressPen.color)
        assertEquals(Tokens.Ink.value, ReadingProgressPen.width.value)
        assertEquals(4f, ReadingProgressPen.glow.value)
        assertEquals(0.55f, ReadingProgressPen.GLOW_ALPHA)
        assertTrue(ReadingProgressPen.color != Tokens.Terracotta)
    }
}
