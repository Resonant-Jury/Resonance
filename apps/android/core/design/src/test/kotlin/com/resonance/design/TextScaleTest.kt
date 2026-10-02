package com.resonance.design

import androidx.compose.ui.unit.Density
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The text-size policy: a large system setting is followed half way, never past 1.25. */
class TextScaleTest {
    @Test fun smallerOrNormalTextIsFollowedAsItIs() {
        for (system in listOf(0.8f, 0.85f, 1f)) assertEquals(system, textScale(system), 0f)
    }

    @Test fun largerTextIsFollowedHalfWay() {
        assertEquals(1.075f, textScale(1.15f), 1e-6f)
        assertEquals(1.15f, textScale(1.3f), 1e-6f)
        assertEquals(1.25f, textScale(1.5f), 1e-6f)
    }

    @Test fun nothingGrowsPastTheCap() {
        for (system in listOf(1.8f, 2f, 3f)) assertEquals(MAX_TEXT_SCALE, textScale(system), 0f)
        assertEquals(1.25f, MAX_TEXT_SCALE, 0f)
    }

    @Test fun theCurveNeverBacksUpAndHasNoStepAtOne() {
        var last = 0f
        var system = 0.5f
        while (system <= 4f) {
            val scale = textScale(system)
            assertTrue("$system → $scale after $last", scale >= last)
            last = scale
            system += 0.05f
        }
        assertEquals(textScale(1f), textScale(1.0001f), 1e-3f)
    }

    @Test fun wordsInOurOwnLineBoxesGrowWithTheRestOfTheText() {
        // What a Compose Text of the same sp draws at, per scale: 14 at 3 px/dp.
        val plain = Density(3f, 1f).cssFontPx(14f)
        val capped = Density(3f, textScale(1.5f)).cssFontPx(14f)
        assertEquals(42f, plain, 1e-3f)
        assertTrue("$capped should be larger than $plain", capped > plain)
        // Larger than 1.5 in the system adds nothing.
        assertEquals(capped, Density(3f, textScale(2f)).cssFontPx(14f), 0f)
        // And less than the 1.5× the system would have given it.
        assertTrue(capped < Density(3f, 1.5f).cssFontPx(14f))
    }
}
