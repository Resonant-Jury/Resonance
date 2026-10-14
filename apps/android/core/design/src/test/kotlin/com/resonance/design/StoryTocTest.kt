package com.resonance.design

import com.resonance.kit.story.StoryParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The card page's table of contents (CardToc.tsx): which headings it lists, and where the terracotta
 * stretch of its rule stands — scrollbarGeometry.ts's thumbGeometry, number for number.
 */
class StoryTocTest {
    @Test fun theStorysH2AndH3InReadingOrderQuotesAndListsToo() {
        val blocks = StoryParser.parse(
            """
            # A title the reader draws as an h1
            
            ## First
            
            words
            
            ### Inside it
            
            > ## Quoted
            
            - ### Listed
            
            #### Too deep
            
            ##  
            
            ## First
            """.trimIndent(),
        )
        val headings = StoryToc.headings(blocks)
        assertEquals(listOf("First", "Inside it", "Quoted", "Listed", "First"), headings.map { it.text })
        assertEquals(listOf(2, 3, 2, 3, 2), headings.map { it.level })
        // Two headings with the same words are two places.
        assertTrue(headings[0].block !== headings[4].block)
    }

    @Test fun theStretchIsTheVisibleShareOfTheListAtLeast36() {
        // 600 of content, 200 showing, at the top: a third of the track.
        assertEquals(ScrollThumb(67f, 0f, 400f), ScrollThumb.of(0f, 600f, 200f, 200f))
        // Halfway down: halfway along the room left.
        assertEquals(ScrollThumb(67f, 66.5f, 400f), ScrollThumb.of(200f, 600f, 200f, 200f))
        // A very long list: never shorter than 36, at the foot at the end.
        assertEquals(ScrollThumb(36f, 164f, 4800f), ScrollThumb.of(4800f, 5000f, 200f, 200f))
    }

    @Test fun nothingWorthABarHasNoStretch() {
        assertNull(ScrollThumb.of(0f, 206f, 200f, 200f))
        assertNull(ScrollThumb.of(0f, 600f, 0f, 0f))
    }

    @Test fun aDragPutsTheStretchUnderTheFinger() {
        assertEquals(200f, ScrollThumb.scrollFor(66.5f, 200f, 67f, 400f), 0.01f)
        // Clamped to the track's ends.
        assertEquals(0f, ScrollThumb.scrollFor(-20f, 200f, 67f, 400f))
        assertEquals(400f, ScrollThumb.scrollFor(500f, 200f, 67f, 400f))
    }

    @Test fun aCardsShimmerMeetsTheCreamInOklabNotRoundTheHueCircle() {
        // Lavender stays lavender (round the circle it swung through red to pink), blue stays blue (not green).
        val (l, c, lavender) = Mixes.skeletonHighlightOklch(290.0)
        assertEquals(0.9225, l, 1e-9)
        assertTrue("lavender hue $lavender", lavender in 285.0..305.0)
        assertTrue(c in 0.02..0.05)
        val blue = Mixes.skeletonHighlightOklch(215.0).third
        assertTrue("blue hue $blue", blue in 200.0..215.0)
        // The theme's own (terracotta-light with cream) stays a warm peach.
        val warm = Mixes.skeletonHighlightOklch(55.0).third
        assertTrue("warm hue $warm", warm in 55.0..62.0)
    }
}
